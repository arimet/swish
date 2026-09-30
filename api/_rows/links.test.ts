// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDb } from './testdb.js'
import * as training from './training.js'
import * as convocation from './convocation.js'
import { teams } from './team.js'
import { players } from './player.js'
import { plays } from './play.js'

describe('link mappers (no database)', () => {
  it('round-trip, and keep the ids in their order', () => {
    const tr = { id: 't1', clubId: 'a', date: '2026-10-01', time: '20:00', theme: 'Écrans', playIds: ['s2', 's1'] }
    expect(training.fromRow(training.toRow(tr), tr.playIds)).toEqual(tr)
    expect(training.fromRow(training.toRow({ id: 't1', clubId: 'a', date: '2026-10-01' }), [])).toEqual({ id: 't1', clubId: 'a', date: '2026-10-01' })

    const c = { matchId: 'm1', playerIds: ['p2', 'p1'], meetTime: '18:30', meetPlace: 'Gymnase' }
    expect(convocation.fromRow(convocation.toRow(c), c.playerIds)).toEqual(c)
  })
})

const t = testDb()

describe.skipIf(!t.ready)('link stores', () => {
  const setup = async () => {
    const db = t.db()
    await teams.put(db, 'a', { id: 'a', name: 'A' })
    await teams.put(db, 'b', { id: 'b', name: 'B' })
    await players.put(db, 'p1', { id: 'p1', teamId: 'a', number: 4, lastName: 'X', firstName: 'Y' })
    await players.put(db, 'p2', { id: 'p2', teamId: 'a', number: 5, lastName: 'X', firstName: 'Z' })
    await db.query("insert into matches (id, club_id, opponent_id, status) values ('m1', 'a', 'b', 'setup')")
    const drawing = { props: [], steps: [{ markers: [], ball: { x: 0, y: 0 }, arrows: [] }] }
    await plays.put(db, 's1', { id: 's1', clubId: 'a', name: 'S1', court: 'half', defense: false, ...drawing })
    await plays.put(db, 's2', { id: 's2', clubId: 'a', name: 'S2', court: 'half', defense: false, ...drawing })
    return db
  }

  it('replaces the links on put, and hides archived targets on read', async () => {
    const db = await setup()
    await training.trainings.put(db, 't1', { id: 't1', clubId: 'a', date: '2026-10-01', playIds: ['s2', 's1'] })
    expect((await training.trainings.get(db, 't1'))?.playIds).toEqual(['s2', 's1'])
    await training.trainings.put(db, 't1', { id: 't1', clubId: 'a', date: '2026-10-01', playIds: ['s1'] })
    expect((await training.trainings.get(db, 't1'))?.playIds).toEqual(['s1'])
    await plays.archive(db, 's1')
    expect(await training.trainings.get(db, 't1')).toEqual({ id: 't1', clubId: 'a', date: '2026-10-01' })

    await convocation.convocations.put(db, 'm1', { matchId: 'm1', playerIds: ['p2', 'p1'] })
    await players.archive(db, 'p2')
    expect((await convocation.convocations.get(db, 'm1'))?.playerIds).toEqual(['p1'])
    expect(await convocation.convocations.list(db)).toHaveLength(1)
  })

  it('refuses to archive a call-up on its own', async () => {
    const db = await setup()
    await convocation.convocations.put(db, 'm1', { matchId: 'm1', playerIds: [] })
    await expect(convocation.convocations.archive(db, 'm1')).rejects.toThrow(/cannot be archived/)
  })
})
