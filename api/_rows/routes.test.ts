// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { testDb } from './testdb.js'

const t = testDb()

/** A handler's answer, captured. */
function call(handler: (req: never, res: never) => Promise<unknown>, req: { method: string; query?: object; body?: unknown; headers?: object }) {
  const out = { status: 0, body: undefined as unknown }
  const res = {
    setHeader: () => {}, end: () => {},
    status(c: number) { out.status = c; return this },
    json(v: unknown) { out.body = v; return this },
  }
  return handler({ query: {}, headers: { 'x-swish-token': 'test' }, ...req } as never, res as never).then(() => out)
}

describe.skipIf(!t.ready)('routes', () => {
  const load = async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    process.env.WRITE_TOKEN = 'test'
    vi.resetModules()
    return {
      docs: (await import('../docs.js')).default,
      mutate: (await import('../mutate.js')).default,
      bundle: (await import('../_bundle.js')).bundle,
      events: (await import('../match/[id]/events.js')).default,
    }
  }

  it('writes a batch, reads it back, archives, and refuses a broken reference', async () => {
    const { docs, mutate } = await load()
    const put = (kind: string, id: string, doc: unknown) => ({ kind, op: 'put', id, doc })
    expect((await call(mutate, { method: 'POST', body: { ops: [
      put('team', 'a', { id: 'a', name: 'A' }),
      put('player', 'p1', { id: 'p1', teamId: 'a', number: 4, lastName: 'X', firstName: 'Y' }),
    ] } })).status).toBe(204)
    expect((await call(docs, { method: 'GET', query: { kind: 'player' } })).body).toHaveLength(1)

    expect((await call(mutate, { method: 'POST', body: { ops: [{ kind: 'team', op: 'del', id: 'a' }] } })).status).toBe(204)
    expect((await call(docs, { method: 'GET', query: { kind: 'player' } })).body).toEqual([])

    const broken = await call(mutate, { method: 'POST', body: { ops: [put('player', 'p2', { id: 'p2', teamId: 'nope', number: 1, lastName: 'X', firstName: 'Y' })] } })
    expect(broken).toEqual({ status: 400, body: { error: 'players_team_id_fkey' } })

    const convocation = await call(mutate, { method: 'POST', body: { ops: [{ kind: 'convocation', op: 'del', id: 'm1' }] } })
    expect(convocation).toEqual({ status: 400, body: { error: 'convocations cannot be archived on its own' } })

    // A tab left open from before per-event writes still sends a whole sheet.
    const sheet = { id: 'm1', meta: { clubId: 'a', opponentId: 'a' }, roster: [], status: 'live', events: [{ id: 'e1', type: 'PERIOD_START', wallClock: 1, period: 1, gameClock: 600 }] }
    expect(await call(mutate, { method: 'POST', body: { ops: [put('match', 'm1', sheet)] } }))
      .toEqual({ status: 400, body: { error: 'a game\'s events go through /api/match/:id/events' } })
  })

  it('adds and archives events, and refuses a malformed one', async () => {
    const { mutate, events, docs } = await load()
    await call(mutate, { method: 'POST', body: { ops: [
      { kind: 'team', op: 'put', id: 'a', doc: { id: 'a', name: 'A' } },
      { kind: 'team', op: 'put', id: 'b', doc: { id: 'b', name: 'B' } },
      { kind: 'match', op: 'put', id: 'm1', doc: { id: 'm1', meta: { clubId: 'a', opponentId: 'b' }, roster: [], events: [], status: 'live' } },
    ] } })
    const e = { id: 'e1', type: 'PERIOD_START', wallClock: 1, period: 1, gameClock: 600 }
    expect((await call(events, { method: 'POST', query: { id: 'm1' }, body: { add: [e] } })).status).toBe(204)
    expect(((await call(docs, { method: 'GET', query: { kind: 'match', id: 'm1' } })).body as { events: unknown[] }).events).toHaveLength(1)
    expect((await call(events, { method: 'POST', query: { id: 'm1' }, body: { archive: ['e1'] } })).status).toBe(204)
    expect(((await call(docs, { method: 'GET', query: { kind: 'match', id: 'm1' } })).body as { events: unknown[] }).events).toEqual([])
    expect((await call(events, { method: 'POST', query: { id: 'm1' }, body: { add: [{ id: 'x', type: 'SCORE', wallClock: 1, period: 1, gameClock: 1 }] } })).status).toBe(400)
  })

  it('refuses a starting five outside the roster, and a request without the token', async () => {
    const { mutate, events } = await load()
    await call(mutate, { method: 'POST', body: { ops: [
      { kind: 'team', op: 'put', id: 'a', doc: { id: 'a', name: 'A' } },
      { kind: 'team', op: 'put', id: 'b', doc: { id: 'b', name: 'B' } },
      { kind: 'match', op: 'put', id: 'm1', doc: { id: 'm1', meta: { clubId: 'a', opponentId: 'b' }, roster: [], events: [], status: 'live' } },
    ] } })
    const five = { id: 'f1', type: 'STARTING_FIVE', team: 'A', playerIds: ['ghost'], wallClock: 1, period: 1, gameClock: 600 }
    expect(await call(events, { method: 'POST', query: { id: 'm1' }, body: { add: [five] } }))
      .toEqual({ status: 400, body: { error: 'starting five outside the roster' } })
    expect((await call(events, { method: 'POST', query: { id: 'm1' }, headers: {}, body: { add: [] } })).status).toBe(401)
  })

  it('keeps nothing of a batch whose second op breaks a constraint', async () => {
    const { docs, mutate } = await load()
    const res = await call(mutate, { method: 'POST', body: { ops: [
      { kind: 'team', op: 'put', id: 'z', doc: { id: 'z', name: 'Z' } },
      { kind: 'player', op: 'put', id: 'p2', doc: { id: 'p2', teamId: 'nope', number: 1, lastName: 'X', firstName: 'Y' } },
    ] } })
    expect(res).toEqual({ status: 400, body: { error: 'players_team_id_fkey' } })
    expect((await call(docs, { method: 'GET', query: { kind: 'team', id: 'z' } })).status).toBe(404)
  })

  it('projects the spectator bundle: public player fields, archived players only if on the sheet, team names', async () => {
    const { mutate, bundle } = await load()
    const put = (kind: string, id: string, doc: unknown) => ({ kind, op: 'put', id, doc })
    const player = (id: string, number: number, extra = {}) =>
      put('player', id, { id, teamId: 'a', number, lastName: `L${id}`, firstName: `F${id}`, ...extra })
    expect((await call(mutate, { method: 'POST', body: { ops: [
      put('team', 'a', { id: 'a', name: 'Club' }),
      put('team', 'b', { id: 'b', name: 'Rival' }),
      player('p1', 4, { license: 'LIC1', birthDate: '2010-01-01', height: 180 }),
      player('p2', 5),
      player('p3', 6),
      put('match', 'm1', {
        id: 'm1', roster: ['p1', 'p2'], events: [], status: 'live',
        meta: { clubId: 'a', opponentId: 'b', championshipLabel: 'PRM', date: '2026-10-04', time: '20:30', venue: 'Vignot' },
      }),
    ] } })).status).toBe(204)
    // p2 (on the sheet) and p3 (not on it) leave the club afterwards.
    expect((await call(mutate, { method: 'POST', body: { ops: [
      { kind: 'player', op: 'del', id: 'p2' }, { kind: 'player', op: 'del', id: 'p3' },
    ] } })).status).toBe(204)

    const b = await bundle('m1')
    const sorted = b!.players.slice().sort((x, y) => (x as { id: string }).id.localeCompare((y as { id: string }).id))
    expect(sorted).toEqual([
      { id: 'p1', teamId: 'a', number: 4, lastName: 'Lp1', firstName: 'Fp1' },
      { id: 'p2', teamId: 'a', number: 5, lastName: 'Lp2', firstName: 'Fp2' },
    ])
    expect(b!.teamNames).toEqual({ A: 'Club', B: 'Rival' })
  })

  it('the stream sends the game once, then again only when rev moves', async () => {
    const { mutate, events } = await load()
    const stream = (await import('../match/[id]/stream.js')).default
    await call(mutate, { method: 'POST', body: { ops: [
      { kind: 'team', op: 'put', id: 'a', doc: { id: 'a', name: 'A' } },
      { kind: 'team', op: 'put', id: 'b', doc: { id: 'b', name: 'B' } },
      { kind: 'match', op: 'put', id: 'm1', doc: { id: 'm1', meta: { clubId: 'a', opponentId: 'b' }, roster: [], events: [], status: 'live' } },
    ] } })
    const sent: string[] = []
    let close = () => {}
    const req = { query: { id: 'm1' }, on: (_: string, f: () => void) => { close = f } }
    const res = { setHeader() {}, writeHead() {}, end() {}, status() { return this }, write: (s: string) => { if (s.startsWith('data:')) sent.push(s) } }
    const running = stream(req as never, res as never)
    await new Promise((r) => setTimeout(r, 1500))
    expect(sent).toHaveLength(1)
    await call(events, { method: 'POST', query: { id: 'm1' }, body: { add: [{ id: 'e1', type: 'PERIOD_START', wallClock: 1, period: 1, gameClock: 600 }] } })
    await new Promise((r) => setTimeout(r, 1500))
    expect(sent).toHaveLength(2)
    close()
    await running
  }, 10_000)
})
