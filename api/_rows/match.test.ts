// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDb } from './testdb.js'
import { eventFromRow, eventToRow, writeEvents } from './events.js'
import { matches } from './match.js'
import { teams } from './team.js'
import { players } from './player.js'
import type { GameEvent, Match } from '../../src/domain/types.js'

const base = { wallClock: 1_727_712_000_123, period: 1, gameClock: 540 }
const EVENTS: GameEvent[] = [
  { id: 'e0', type: 'STARTING_FIVE', team: 'A', playerIds: ['p2', 'p1'], ...base },
  { id: 'e1', type: 'PERIOD_START', ...base },
  { id: 'e2', type: 'CLOCK_START', ...base },
  { id: 'e3', type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.123456789, y: 0.9 }, ...base },
  { id: 'e4', type: 'SCORE', team: 'B', kind: '2int', ...base },
  { id: 'e5', type: 'MISS', team: 'A', playerId: 'p2', kind: '2ext', shot: { x: 0.3, y: 0.4 }, ...base },
  { id: 'e6', type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'defensive', ...base },
  { id: 'e7', type: 'FOUL', team: 'A', target: { kind: 'coach' }, foulType: 'technical', ...base },
  { id: 'e8', type: 'TIMEOUT', team: 'B', ...base },
  { id: 'e9', type: 'SUBSTITUTION', team: 'A', playerInId: 'p3', playerOutId: 'p2', ...base },
  { id: 'e10', type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist', ...base },
  { id: 'e13', type: 'MISS', team: 'A', playerId: 'p1', kind: 'lf', ...base },
  { id: 'e14', type: 'FOUL', team: 'B', target: { kind: 'team' }, foulType: 'defensive', ...base },
  { id: 'e11', type: 'CLOCK_STOP', ...base },
  { id: 'e12', type: 'PERIOD_END', ...base },
]

describe('event mapper (no database)', () => {
  it('round-trips every event type', () => {
    for (const e of EVENTS) {
      const row = { ...eventToRow('m1', e), seq: '1' }
      expect(eventFromRow(row, ['p2', 'p1'])).toEqual(e)
    }
  })
})

const t = testDb()

const MATCH: Match = {
  id: 'm1',
  meta: { clubId: 'a', opponentId: 'b', championshipLabel: 'PRM', date: '2026-10-04', time: '20:30', venue: 'Vignot' },
  roster: ['p1', 'p2', 'p3'], events: [], status: 'live',
}

describe.skipIf(!t.ready)('match store', () => {
  const setup = async () => {
    const db = t.db()
    await teams.put(db, 'a', { id: 'a', name: 'A' })
    await teams.put(db, 'b', { id: 'b', name: 'B' })
    for (const [i, id] of ['p1', 'p2', 'p3'].entries()) {
      await players.put(db, id, { id, teamId: 'a', number: i + 4, lastName: 'X', firstName: id })
    }
    await matches.put(db, 'm1', MATCH)
    return db
  }

  it('assembles meta, roster and events, in order', async () => {
    const db = await setup()
    await writeEvents(db, 'm1', EVENTS, [])
    expect(await matches.get(db, 'm1')).toEqual({ ...MATCH, events: EVENTS })
  })

  it('never writes events through put', async () => {
    const db = await setup()
    await matches.put(db, 'm1', { ...MATCH, events: EVENTS })
    expect((await matches.get(db, 'm1'))?.events).toEqual([])
  })

  it('adds an event once, whatever the retries, and archives it', async () => {
    const db = await setup()
    await writeEvents(db, 'm1', [EVENTS[1]], [])
    await writeEvents(db, 'm1', [EVENTS[1]], [])
    expect((await matches.get(db, 'm1'))?.events).toHaveLength(1)
    await writeEvents(db, 'm1', [], ['e1', 'unknown'])
    expect((await matches.get(db, 'm1'))?.events).toEqual([])
  })

  it('writes a replacement where the event it replaces stood, in the order given', async () => {
    const db = await setup()
    const at = (id: string): GameEvent => ({ id, type: 'STAT', team: 'A', playerId: 'p1', stat: 'block', ...base })
    await writeEvents(db, 'm1', [at('a'), at('b'), at('c')], [])
    await writeEvents(db, 'm1', [at('x'), at('y')], ['b'], { x: 'b', y: 'b' })
    expect((await matches.get(db, 'm1'))?.events.map((e) => e.id)).toEqual(['a', 'x', 'y', 'c'])
    // Before the very first event too, and the plain appends still go to the end.
    await writeEvents(db, 'm1', [at('z'), at('w')], [], { z: 'a' })
    expect((await matches.get(db, 'm1'))?.events.map((e) => e.id)).toEqual(['z', 'a', 'x', 'y', 'c', 'w'])
  })

  it('refuses a missed field goal with no spot: only a free throw goes without one', async () => {
    const db = await setup()
    const bad = { id: 'x', type: 'MISS', team: 'A', playerId: 'p1', kind: '2int', ...base } as GameEvent
    await expect(writeEvents(db, 'm1', [bad], [])).rejects.toThrow(/event_shape/)
  })

  it('refuses a starting five outside the roster', async () => {
    const db = await setup()
    const bad: GameEvent = { id: 'x', type: 'STARTING_FIVE', team: 'A', playerIds: ['p1', 'ghost'], ...base }
    await expect(writeEvents(db, 'm1', [bad], [])).rejects.toThrow(/starting five/)
    await expect(writeEvents(db, 'm1', [{ ...bad, team: 'B', playerIds: ['p1'] }], [])).rejects.toThrow(/only the club/)
  })

  it('keeps an archived player on the sheets they played', async () => {
    const db = await setup()
    await writeEvents(db, 'm1', [EVENTS[3]], [])
    await players.archive(db, 'p1')
    expect((await matches.get(db, 'm1'))?.roster).toEqual(['p1', 'p2', 'p3'])
    expect((await matches.get(db, 'm1'))?.events).toHaveLength(1)
  })

  it('bumps the revision on put', async () => {
    const db = await setup()
    await matches.put(db, 'm1', { ...MATCH, status: 'finished' })
    const { rows } = await db.query<{ rev: string }>("select rev from matches where id = 'm1'")
    expect(Number(rows[0].rev)).toBeGreaterThan(0)
  })
})
