import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get, list, mutate, checkToken, onState, setToken, TOKEN_KEY } from './api'

/**
 * The single door to the database, and what it does when the door does not open.
 *
 * A failed write is a **refusal**, not a delay: there is no queue to keep it.
 * Everything downstream — the rollback in `useMatch`, the pill in `ConnectionState` —
 * depends on this module throwing rather than resolving, and on it saying *which*
 * failure it was: a rejected token needs a person, a dropped network needs patience.
 */

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const status = (code: number) => new Response(null, { status: code })

let seen: State[] = []
type State = 'idle' | 'ok' | 'token' | 'network'
let unsubscribe: () => void

beforeEach(() => {
  seen = []
  unsubscribe = onState((s) => seen.push(s))
})
afterEach(() => { unsubscribe(); vi.restoreAllMocks(); setToken('') })

describe('reading', () => {
  it('lists the documents of a kind', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok([{ id: 't1' }]))
    await expect(list('team')).resolves.toEqual([{ id: 't1' }])
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain('/api/docs?kind=team')
  })

  it('a document the database does not hold is `undefined`, not a failure', async () => {
    // A stale link is an ordinary answer: the screen must say "not found", and the
    // pill must stay quiet.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(404))
    await expect(get('match', 'gone')).resolves.toBeUndefined()
    expect(seen.at(-1)).toBe('ok')
  })

  it('the id is escaped rather than pasted into the query string', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ id: 'a b&c' }))
    await get('team', 'a b&c')
    expect(String(f.mock.calls[0][0])).toContain('id=a%20b%26c')
  })
})

describe('writing', () => {
  it('carries the device token and the batch', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(204))
    localStorage.setItem(TOKEN_KEY, 'sesame')

    await mutate([{ kind: 'team', op: 'del', id: 't1' }])

    const [, init] = f.mock.calls[0]
    expect((init!.headers as Record<string, string>)['x-swish-token']).toBe('sesame')
    expect(JSON.parse(String(init!.body))).toEqual({ ops: [{ kind: 'team', op: 'del', id: 't1' }] })
  })

  it('an empty batch costs no request', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(204))
    await mutate([])
    expect(f).not.toHaveBeenCalled()
  })

  it('a refused token throws and says it is the token', async () => {
    // Retrying will achieve nothing until someone fixes the setting: the state has to
    // name it, or the interface would blame the network for two hours.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(401))
    await expect(mutate([{ kind: 'team', op: 'del', id: 't1' }])).rejects.toThrow()
    expect(seen.at(-1)).toBe('token')
  })

  it('a server with no token configured counts as a token problem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(503))
    await expect(mutate([{ kind: 'team', op: 'del', id: 't1' }])).rejects.toThrow()
    expect(seen.at(-1)).toBe('token')
  })

  it('a dropped network throws and says it is the network', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(mutate([{ kind: 'team', op: 'del', id: 't1' }])).rejects.toThrow()
    expect(seen.at(-1)).toBe('network')
  })
})

describe('checking the token', () => {
  it('probes with a write, because reading is public', async () => {
    // Hydrating proved nothing: `GET /api/docs` succeeds for a device that has never
    // been handed a token, so the administration screen would announce success on a
    // typo.
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(204))
    await expect(checkToken()).resolves.toBe('ok')
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toContain('/api/mutate')
    expect(init!.method).toBe('POST')
    expect(JSON.parse(String(init!.body))).toEqual({ ops: [] })
  })

  it('reports a refusal instead of throwing: the screen shows it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(401))
    await expect(checkToken()).resolves.toBe('token')
  })
})
