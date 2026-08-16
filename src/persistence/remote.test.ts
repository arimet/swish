import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { db } from './db'

/**
 * The mirror against the source of truth.
 *
 * `remote.ts` reads `VITE_SYNC_URL` **at import time**, and the vitest configuration
 * blanks it for the whole suite (see `vite.config.ts`): this file therefore sets it
 * back itself, then imports the module dynamically. It is the only way to exercise the
 * remote path without forcing the fifty other test files to cross it.
 */
async function remoteModule() {
  vi.stubEnv('VITE_SYNC_URL', '/api')
  vi.resetModules()
  return import('./remote')
}

/** A hydration response, as `GET /api/state` returns it. */
const state = (docs: unknown[], alive: string[], rev = 1) =>
  ({ ok: true, status: 200, json: async () => ({ rev, docs, alive }) })

beforeEach(async () => {
  await db.teams.clear(); await db.players.clear(); await db.matches.clear(); await db.outbox.clear()
  localStorage.clear()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('hydrate — the server is authoritative', () => {
  it('writes what the server sends', async () => {
    const { hydrate } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () =>
      state([{ kind: 'team', id: 'ta', doc: { id: 'ta', name: 'VIGNOT' } }], ['team:ta'])))

    expect(await hydrate()).toBe(true)
    expect((await db.teams.get('ta'))?.name).toBe('VIGNOT')
  })

  it('deletes locally whatever is no longer in the manifest', async () => {
    // This is the property that replaces tombstones: a deletion really removes the row
    // server-side, so nothing describes it — the absence of the id is what carries
    // it.
    await db.teams.put({ id: 'retiree', name: 'PARTIE' })
    await db.teams.put({ id: 'ta', name: 'VIGNOT' })
    const { hydrate } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => state([], ['team:ta'])))

    await hydrate()
    expect(await db.teams.get('retiree')).toBeUndefined()
    expect(await db.teams.get('ta')).toBeDefined()
  })

  it('an empty hydration empties the mirror', async () => {
    // The test exists to lock the invariant down, not in spite of it: "surely we are
    // not going to erase their data" is exactly the compassionate regression that
    // would give the mirror back the status of a second truth.
    await db.teams.put({ id: 'ta', name: 'VIGNOT' })
    await db.players.put({ id: 'p1', teamId: 'ta', number: 4, lastName: 'X', firstName: 'Y' })
    const { hydrate } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => state([], [])))

    await hydrate()
    expect(await db.teams.count()).toBe(0)
    expect(await db.players.count()).toBe(0)
  })

  it('does not erase what is waiting in the queue', async () => {
    // This is not stale data the server would ignore: it is a write the person has
    // just made and that has not left yet.
    await db.teams.put({ id: 'neuve', name: 'CRÉÉE HORS LIGNE' })
    await db.outbox.add({ kind: 'team', op: 'put', id: 'neuve', ts: Date.now(), modifiedAt: new Date().toISOString() })
    const { hydrate } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => state([], [])))

    await hydrate()
    expect(await db.teams.get('neuve')).toBeDefined()
  })

  it('advances the cursor, and sends it back on the next request', async () => {
    const { hydrate } = await remoteModule()
    const appels: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { appels.push(url); return state([], [], 42) }))

    await hydrate()
    await hydrate()
    expect(appels[0]).toContain('since=0')
    expect(appels[1]).toContain('since=42')
  })

  it('a rejected token does not touch the mirror', async () => {
    await db.teams.put({ id: 'ta', name: 'VIGNOT' })
    const { hydrate, syncState } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))

    expect(await hydrate()).toBe(false)
    expect(await db.teams.get('ta')).toBeDefined()
    expect(syncState()).toBe('token')
  })
})

describe('the synchronisation\'s health', () => {
  it('announces the number of pending actions and the state of the last send', async () => {
    // The count is the honest measure: "waiting" does not say whether it is
    // progressing; a number that grows does.
    const { enqueuePut, flushNow, onHealth } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    const vus: { state: string; pending: number }[] = []
    const stop = onHealth((s) => vus.push(s))

    await enqueuePut('team', 'ta', { id: 'ta' })
    await enqueuePut('team', 'tb', { id: 'tb' })
    await flushNow()
    stop()

    expect(vus.at(-1)).toEqual({ state: 'token', pending: 2 })
  })

  it('falls back to zero when the queue leaves', async () => {
    // This is what makes the pill disappear on its own: it does not fade after a
    // delay, it fades when the condition stops being true.
    const { enqueuePut, flushNow, onHealth } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })))
    const vus: { state: string; pending: number }[] = []
    const stop = onHealth((s) => vus.push(s))

    await enqueuePut('team', 'ta', { id: 'ta' })
    await flushNow()
    stop()

    expect(vus.at(-1)).toEqual({ state: 'ok', pending: 0 })
  })

  it('stops announcing once unsubscribed', async () => {
    const { enqueuePut, onHealth } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })))
    let appels = 0
    onHealth(() => { appels++ })()

    await enqueuePut('team', 'ta', { id: 'ta' })
    expect(appels).toBe(0)
  })
})

describe('the outgoing queue', () => {
  it('stamps each operation at the moment of the gesture, not of the send', async () => {
    // Conflict arbitration rests entirely on this: a queue held up for two hours by a
    // gym with no coverage must not overwrite a correction made meanwhile on another
    // device.
    const { enqueuePut } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })))

    const avant = Date.now()
    await enqueuePut('team', 'ta', { id: 'ta', name: 'VIGNOT' })
    const [item] = await db.outbox.toArray()

    expect(item.modifiedAt).toBeTruthy()
    expect(Date.parse(item.modifiedAt)).toBeGreaterThanOrEqual(avant)
  })

  it('keeps the queue when the server rejects the token', async () => {
    const { enqueuePut, flushNow, syncState } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))

    await enqueuePut('team', 'ta', { id: 'ta', name: 'VIGNOT' })
    await flushNow()

    expect(await db.outbox.count()).toBe(1)
    expect(syncState()).toBe('token')
  })

  it('does not send a large batch with `keepalive` — the browser caps it at 64 kB', async () => {
    // Without this precaution, `fetch` fails outright past the quota, the failure lands
    // in the `catch` alongside network outages, and the queue retries forever a send
    // that cannot succeed. A single game weighs tens of kilobytes once its log is
    // serialised.
    const { enqueuePut, flushNow } = await remoteModule()
    const appels: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { appels.push(init); return { ok: true, status: 204 } }))

    await enqueuePut('match', 'gros', { pave: 'x'.repeat(70_000) })
    await flushNow()
    expect(appels.at(-1)?.keepalive).toBe(false)

    await db.outbox.clear()
    await enqueuePut('team', 'ta', { id: 'ta', name: 'VIGNOT' })
    await flushNow()
    expect(appels.at(-1)?.keepalive).toBe(true)
  })

  it('keeps only the last operation per entity', async () => {
    const { enqueuePut, flushNow } = await remoteModule()
    let sent: { ops: { id: string; doc: { name: string } }[] } | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string); return { ok: true, status: 204 }
    }))

    await enqueuePut('team', 'ta', { id: 'ta', name: 'PREMIER' })
    await enqueuePut('team', 'ta', { id: 'ta', name: 'DERNIER' })
    await flushNow()

    expect(sent!.ops).toHaveLength(1)
    expect(sent!.ops[0].doc.name).toBe('DERNIER')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('checkToken — reading is public, writing is not', () => {
  it('hydrates a device that has never been given a token', async () => {
    // The regression this locks down is the one the deployment surfaced: a visitor in
    // private browsing opened an empty application instead of the club, because
    // hydration asked for the same secret as writing.
    const { hydrate } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () =>
      state([{ kind: 'team', id: 'ta', doc: { id: 'ta', name: 'VIGNOT' } }], ['team:ta'])))

    expect(localStorage.getItem('swish-sync-token')).toBeNull()
    expect(await hydrate()).toBe(true)
    expect((await db.teams.get('ta'))?.name).toBe('VIGNOT')
  })

  it('probes the write route, not the read one', async () => {
    // Probing `/api/state` would answer yes to any token at all, since it no longer
    // reads one. The verdict has to come from the only guarded door.
    const { checkToken } = await remoteModule()
    const calls: { url: string; method?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init?.method }); return { ok: true, status: 204 }
    }))

    expect(await checkToken()).toBe('ok')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/mutate')
    expect(calls[0].method).toBe('POST')
  })

  it('sends an empty batch, so verifying writes nothing', async () => {
    const { checkToken } = await remoteModule()
    let sent: { ops: unknown[] } | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string); return { ok: true, status: 204 }
    }))

    await checkToken()
    expect(sent!.ops).toEqual([])
  })

  it('calls a refused token refused, and a missing server-side token too', async () => {
    // 503 is the server saying `SYNC_WRITE_TOKEN` is not configured. From the
    // administrator's seat both mean the same thing: writing will not go through.
    for (const status of [401, 503]) {
      const { checkToken } = await remoteModule()
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status })))
      expect(await checkToken()).toBe('token')
    }
  })

  it('distinguishes an absent network from a refusal', async () => {
    const { checkToken } = await remoteModule()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await checkToken()).toBe('network')
  })
})
