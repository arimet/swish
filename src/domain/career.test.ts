import { describe, expect, it } from 'vitest'
import { ageAt, playerCareer } from './career'
import type { GameEvent, Match } from './types'

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

/** Rencontre où `roster` joue, avec le chrono lancé puis arrêté à `stop`. */
const mk = (id: string, roster: string[], events: Partial<GameEvent>[], stop = 300): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
  roster, status: 'finished',
  events: ([
    { type: 'STARTING_FIVE', team: 'A', playerIds: roster.slice(0, 5) },
    { type: 'CLOCK_START', gameClock: 600 },
    ...events,
    { type: 'CLOCK_STOP', gameClock: stop },
  ] as Partial<GameEvent>[]).map(ev),
})

describe('ageAt', () => {
  it('gives the age reached', () => {
    expect(ageAt('2000-06-15', new Date('2026-06-15'))).toBe(26)
  })

  it('adds the year only on the birthday itself', () => {
    expect(ageAt('2000-06-15', new Date('2026-06-14'))).toBe(25)
    expect(ageAt('2000-06-15', new Date('2026-06-16'))).toBe(26)
  })

  it('handles a 29 February', () => {
    expect(ageAt('2004-02-29', new Date('2026-03-01'))).toBe(22)
  })
})

describe('playerCareer', () => {
  const m1 = mk('m1', ['p1', 'p2', 'p3', 'p4', 'p5'], [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'reb_def' },
    { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' },
  ])
  const m2 = mk('m2', ['p1', 'p2', 'p3', 'p4', 'p5'], [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: { x: 0.5, y: 0.15 } },
    { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
  ])

  it('accumulates across several games', () => {
    const c = playerCareer([m1, m2], 'p1')
    expect(c.games).toBe(2)
    expect(c.points).toBe(5)
    expect(c.threes).toBe(1)
    expect(c.twoInside).toBe(1)
    expect(c.assists).toBe(2)
    expect(c.defRebounds).toBe(1)
    expect(c.fouls).toBe(1)
    expect(c.misses).toBe(1)
  })

  it('accumulates court time', () => {
    // 600 → 300 in each game, the player starting throughout.
    expect(playerCareer([m1, m2], 'p1').seconds).toBe(600)
  })

  it('ignores games where the player is not on the roster', () => {
    const autre = mk('m3', ['q1', 'q2', 'q3', 'q4', 'q5'], [])
    expect(playerCareer([m1, autre], 'p1').games).toBe(1)
  })

  it('counts no game for a player who has never played', () => {
    const c = playerCareer([m1, m2], 'inconnu')
    expect(c.games).toBe(0)
    expect(c.points).toBe(0)
    expect(c.seconds).toBe(0)
  })

  it('ignores games that have not started', () => {
    const aVenir: Match = { ...mk('m4', ['p1'], []), status: 'setup', events: [] }
    expect(playerCareer([m1, aVenir], 'p1').games).toBe(1)
  })

  it('does not count a game where the player is on the roster with no court time and no action', () => {
    // p6 is on the roster but is neither a starter nor part of any substitution.
    const banc = mk('m5', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], [])
    expect(playerCareer([banc], 'p6').games).toBe(0)
  })

  it('counts a game for a player with no court time but credited with a basket', () => {
    const banc = mk('m6', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], [
      { type: 'SCORE', team: 'A', playerId: 'p6', kind: '2int', shot: { x: 0.5, y: 0.15 } },
    ])
    expect(playerCareer([banc], 'p6').games).toBe(1)
  })
})
