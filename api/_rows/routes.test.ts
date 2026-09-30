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
    expect(convocation.status).toBe(400)
  })
})
