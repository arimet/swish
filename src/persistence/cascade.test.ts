import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { newPlay } from '../domain/plays'
import * as r from './repositories'

/**
 * What each cascade sends, and in how many batches.
 *
 * `repositories.ts`'s trap is its cascades. Removing a team takes its players, its
 * results, its sessions, its plays and its message; removing a player prunes the
 * call-ups; removing a play prunes the sessions that cited it. Every one of those
 * derived writes has to be in the batch.
 *
 * Two properties, and the second is the one a plain "is it deleted?" test misses:
 *
 * - **Nothing is forgotten.** A missing op leaves an orphan in the database — a
 *   call-up naming a player who no longer exists, a session counting a play that is
 *   gone — and no screen can reach it to clean it up.
 * - **It is one batch, hence one transaction.** A cascade split into several requests
 *   can land half-applied: the network drops between two of them and the club is left
 *   in a state the application cannot describe, let alone repair.
 *
 * So the assertions are on the requests themselves, captured on the way out.
 */

interface Op { kind: string; op: string; id: string; doc?: unknown }

/** The batches posted to `/api/mutate`, in order. */
let batches: Op[][] = []

const keys = (ops: Op[]) => ops.map((o) => `${o.kind}:${o.op}:${o.id}`).sort()

beforeEach(() => {
  batches = []
  const server = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/api/mutate') && init?.body) {
      batches.push((JSON.parse(String(init.body)) as { ops: Op[] }).ops)
    }
    return server(input, init)
  })
})
afterEach(() => { vi.restoreAllMocks() })

/** The batch of the write under test — the arrangement's own writes are dropped. */
const only = () => { const b = batches; batches = []; return b }

describe('the deletion cascades', () => {
  it('removing a team takes everything that depends on it, in one batch', async () => {
    await r.saveTeam({ id: 'ta', name: 'VIGNOT' })
    await r.savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'L' })
    await r.saveResult({ id: 'r1', championshipLabel: 'P', homeId: 'ta', awayId: 'tb', homeScore: 1, awayScore: 2 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveMessage({ clubId: 'ta', text: 'x', writtenAt: '2026-08-10T18:00:00.000Z' })
    only()

    await r.deleteTeam('ta')

    const sent = only()
    expect(sent).toHaveLength(1)
    expect(keys(sent[0])).toEqual([
      'message:del:ta', 'play:del:s1', 'player:del:p1',
      'result:del:r1', 'team:del:ta', 'training:del:tr1',
    ])
  })

  it('removing a player also sends the pruned call-ups', async () => {
    await r.savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'M', firstName: 'L' })
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2'] })
    only()

    await r.deletePlayer('p1')

    const sent = only()
    expect(sent).toHaveLength(1)
    expect(keys(sent[0])).toEqual(['convocation:put:m1', 'player:del:p1'])
    // And what leaves is indeed the pruned version, not the old one.
    const op = sent[0].find((o) => o.kind === 'convocation')
    expect((op!.doc as { playerIds: string[] }).playerIds).toEqual(['p2'])
  })

  it('removing a game takes its call-up', async () => {
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    only()

    await r.deleteMatch('m1')

    expect(keys(only()[0])).toEqual(['convocation:del:m1', 'match:del:m1'])
  })

  it('removing a play also sends the sessions that cited it', async () => {
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05', playIds: ['s1'] })
    only()

    await r.deletePlay('s1')

    const sent = only()
    expect(keys(sent[0])).toEqual(['play:del:s1', 'training:put:tr1'])
    const op = sent[0].find((o) => o.kind === 'training')
    expect((op!.doc as { playIds: string[] }).playIds).toEqual([])
  })

  it('sends the play as it is stored, timestamp included', async () => {
    // `savePlay` adds `updatedAt` to the object written. Sending the argument received
    // would file a version with no timestamp, and the library would look shuffled at
    // the next opening — it has only that field to order itself by.
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    const [op] = only()[0]
    expect((op.doc as { updatedAt?: string }).updatedAt).toBeTruthy()
  })

  it('ticking a play on a session sends the session', async () => {
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    only()

    await r.toggleTrainingPlay('tr1', 's1')

    expect(keys(only()[0])).toEqual(['training:put:tr1'])
  })
})

describe('the bulk cleanup', () => {
  it('takes the call-ups of the deleted games', async () => {
    await r.saveMatch({ id: 'm1', meta: { clubId: 'ta', opponentId: 'tb' }, roster: [], events: [], status: 'setup' })
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    only()

    await r.deleteMatchesWhere(() => true)

    expect(keys(only()[0])).toEqual(['convocation:del:m1', 'match:del:m1'])
  })

  it('sends every result, session and play deleted in bulk', async () => {
    await r.saveResult({ id: 'r1', championshipLabel: 'P', homeId: 'tb', awayId: 'tc', homeScore: 1, awayScore: 2 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    only()

    await r.deleteAllResults()
    await r.deleteTrainingsOfClub('ta')
    await r.deletePlaysOfClub('ta')

    expect(only().flatMap(keys).sort()).toEqual(['play:del:s1', 'result:del:r1', 'training:del:tr1'])
  })

  /**
   * Emptying a sheet is one `put` and it really empties it.
   *
   * The check is here because it used not to be true. While match sheets were merged
   * across devices, a `put` carrying an empty event log came straight back out of the
   * union with every event still in it — the screen reported the sheets emptied and
   * nothing had moved. Writes replace now, so the plain form is the correct one.
   */
  it('empties a sheet with a single write that really empties it', async () => {
    await r.saveMatch({
      id: 'm1', meta: { clubId: 'ta', opponentId: 'tb' }, roster: [], status: 'finished',
      events: [{ id: 'e1', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 }],
    })
    only()

    await r.clearClubStats('ta')

    const sent = only()
    expect(sent).toHaveLength(1)
    expect(sent[0].map((o) => `${o.op}:${o.id}`)).toEqual(['put:m1'])
    expect((await r.getMatch('m1'))?.events).toEqual([])
    expect((await r.getMatch('m1'))?.status).toBe('setup')
  })
})
