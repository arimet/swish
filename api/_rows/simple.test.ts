// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDb } from './testdb.js'
import * as team from './team.js'
import * as player from './player.js'
import * as result from './result.js'
import * as message from './message.js'
import * as play from './play.js'
import type { Play } from '../../src/domain/plays.js'

const PLAY: Play = {
  id: 's1', clubId: 'a', name: 'Pick', court: 'half', defense: false, folder: 'Écran',
  props: [{ kind: 'cone', at: { x: 0.2, y: 0.3 } }],
  steps: [{ markers: [{ side: 'offense', position: 1, at: { x: 0.5, y: 0.5 } }], ball: { side: 'offense', position: 1 }, arrows: [] }],
  updatedAt: '2026-09-30T10:00:00.000Z',
}

describe('row mappers (no database)', () => {
  it('round-trip every field, and leave absent fields absent', () => {
    const t = { id: 'a', name: 'VIGNOT', coach: 'Rimet' }
    expect(team.fromRow(team.toRow(t))).toEqual(t)
    expect(team.fromRow(team.toRow({ id: 'a', name: 'VIGNOT' }))).toEqual({ id: 'a', name: 'VIGNOT' })

    const p = { id: 'p1', teamId: 'a', number: 4, lastName: 'MARTIN', firstName: 'Léo', license: 'VT1', birthDate: '2001-02-03', height: 188 }
    expect(player.fromRow(player.toRow(p))).toEqual(p)

    const r = { id: 'r1', championshipLabel: 'PRM', date: '2026-10-04', homeId: 'a', awayId: 'b', homeScore: 70, awayScore: 64 }
    expect(result.fromRow(result.toRow(r))).toEqual(r)

    const m = { clubId: 'a', text: 'Rdv 19h', writtenAt: '2026-09-30T18:00:00.000Z' }
    expect(message.fromRow(message.toRow(m))).toEqual(m)

    expect(play.fromRow(play.toRow(PLAY))).toEqual(PLAY)
  })
})

const t = testDb()

describe.skipIf(!t.ready)('one-table stores', () => {
  it('put, get, list, archive, and un-archive on put', async () => {
    const db = t.db()
    await team.teams.put(db, 'a', { id: 'a', name: 'VIGNOT' })
    await team.teams.put(db, 'b', { id: 'b', name: 'ASPTT' })
    await player.players.put(db, 'p1', { id: 'p1', teamId: 'a', number: 4, lastName: 'M', firstName: 'L', birthDate: '2001-02-03' })
    await result.results.put(db, 'r1', { id: 'r1', championshipLabel: 'PRM', homeId: 'a', awayId: 'b', homeScore: 1, awayScore: 2 })
    await message.messages.put(db, 'a', { clubId: 'a', text: 'x', writtenAt: '2026-09-30T18:00:00.000Z' })
    await play.plays.put(db, 's1', PLAY)

    expect(await player.players.get(db, 'p1')).toMatchObject({ birthDate: '2001-02-03' })
    expect(await play.plays.get(db, 's1')).toEqual(PLAY)
    expect(await team.teams.list(db)).toHaveLength(2)

    await team.teams.archive(db, 'a')
    expect(await team.teams.get(db, 'a')).toBeNull()
    expect(await player.players.list(db)).toEqual([])
    expect(await result.results.list(db)).toEqual([])
    expect(await message.messages.get(db, 'a')).toBeNull()
    expect(await play.plays.list(db)).toEqual([])

    await team.teams.put(db, 'a', { id: 'a', name: 'VIGNOT' })
    expect(await player.players.list(db)).toHaveLength(1)
  })
})
