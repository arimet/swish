import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { db } from './db'
import { newPlay } from '../domain/plays'

/**
 * What the writes put in the queue.
 *
 * `repositories.ts`'s trap is its cascades. Removing a team takes its players, its
 * results, its sessions, its plays and its message; removing a player prunes the
 * call-ups; removing a play prunes the sessions that cited it. Every one of those
 * derived writes must leave for the database.
 *
 * Forgetting one does not merely leave the server behind: at the next hydration the
 * manifest **returns** the document you thought deleted, and the cleanup undoes itself
 * before the user's eyes. It is a round trip, so it is visible, so it gets reported as
 * a deletion bug that "comes back by itself".
 *
 * The suite runs with `VITE_SYNC_URL` blanked (see `vite.config.ts`): this file sets
 * it back itself, otherwise the queue would stay silent and all these tests would pass
 * for the wrong reasons.
 */
async function repo() {
  vi.stubEnv('VITE_SYNC_URL', '/api')
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0 })))
  return import('./repositories')
}

/** The queue, in a readable form: `kind:operation:key`. */
const file = async () =>
  (await db.outbox.orderBy('seq').toArray()).map((o) => `${o.kind}:${o.op}:${o.id}`)

const vider = () => db.outbox.clear()

beforeEach(async () => {
  await Promise.all([
    db.teams.clear(), db.players.clear(), db.matches.clear(), db.results.clear(),
    db.convocations.clear(), db.trainings.clear(), db.plays.clear(), db.messages.clear(), db.outbox.clear(),
  ])
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('the five kinds reach the queue', () => {
  it('queues every write, under the right key', async () => {
    const r = await repo()
    await r.saveResult({ id: 'r1', championshipLabel: 'Poule A', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    // The two keys that are not an `id`: the call-up is filed under its game, the
    // message under its club.
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await r.saveMessage({ clubId: 'ta', text: 'Maillot blanc.', writtenAt: '2026-08-10T18:00:00.000Z' })

    expect(await file()).toEqual([
      'result:put:r1', 'training:put:tr1', 'play:put:s1',
      'convocation:put:m1', 'message:put:ta',
    ])
  })

  it('sends the play as it is stored, timestamp included', async () => {
    // `savePlay` adds `updatedAt` to the object written. Queueing the argument received
    // would send a version with no timestamp, and the library would look shuffled on
    // the other devices — which have only the store's order.
    const r = await repo()
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    const [op] = await db.outbox.toArray()
    expect((op.doc as { updatedAt?: string }).updatedAt).toBeTruthy()
  })
})

describe('the deletion cascades', () => {
  it('removing a team takes everything that depends on it', async () => {
    const r = await repo()
    await r.saveTeam({ id: 'ta', name: 'VIGNOT' })
    await r.savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'L' })
    await r.saveResult({ id: 'r1', championshipLabel: 'P', homeId: 'ta', awayId: 'tb', homeScore: 1, awayScore: 2 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveMessage({ clubId: 'ta', text: 'x', writtenAt: '2026-08-10T18:00:00.000Z' })
    await vider()

    await r.deleteTeam('ta')

    expect((await file()).sort()).toEqual([
      'message:del:ta', 'play:del:s1', 'player:del:p1',
      'result:del:r1', 'team:del:ta', 'training:del:tr1',
    ])
  })

  it('removing a player also sends the pruned call-ups', async () => {
    const r = await repo()
    await r.savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'M', firstName: 'L' })
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2'] })
    await vider()

    await r.deletePlayer('p1')

    expect((await file()).sort()).toEqual(['convocation:put:m1', 'player:del:p1'])
    // And what leaves is indeed the pruned version, not the old one.
    const op = (await db.outbox.toArray()).find((o) => o.kind === 'convocation')
    expect((op!.doc as { playerIds: string[] }).playerIds).toEqual(['p2'])
  })

  it('removing a game takes its call-up', async () => {
    const r = await repo()
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await vider()

    await r.deleteMatch('m1')

    expect((await file()).sort()).toEqual(['convocation:del:m1', 'match:del:m1'])
  })

  it('removing a play also sends the sessions that cited it', async () => {
    const r = await repo()
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05', playIds: ['s1'] })
    await vider()

    await r.deletePlay('s1')

    expect((await file()).sort()).toEqual(['play:del:s1', 'training:put:tr1'])
    const op = (await db.outbox.toArray()).find((o) => o.kind === 'training')
    expect((op!.doc as { playIds: string[] }).playIds).toEqual([])
  })

  it('ticking a play on a session sends the session', async () => {
    const r = await repo()
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await vider()

    await r.toggleTrainingPlay('tr1', 's1')

    expect(await file()).toEqual(['training:put:tr1'])
  })
})

describe('the bulk cleanup', () => {
  it('takes the call-ups of the deleted games', async () => {
    const r = await repo()
    await r.saveMatch({ id: 'm1', meta: { clubId: 'ta', opponentId: 'tb' }, roster: [], events: [], status: 'setup' })
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await vider()

    await r.deleteMatchesWhere(() => true)

    expect((await file()).sort()).toEqual(['convocation:del:m1', 'match:del:m1'])
  })

  it('queues every result, session and play deleted in bulk', async () => {
    const r = await repo()
    await r.saveResult({ id: 'r1', championshipLabel: 'P', homeId: 'tb', awayId: 'tc', homeScore: 1, awayScore: 2 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await vider()

    await r.deleteAllResults()
    await r.deleteTrainingsOfClub('ta')
    await r.deletePlaysOfClub('ta')

    expect((await file()).sort()).toEqual(['play:del:s1', 'result:del:r1', 'training:del:tr1'])
  })
})
