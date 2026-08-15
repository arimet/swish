import type { Table } from 'dexie'
import { db, type OutboxItem } from './db'

/**
 * The local mirror and its write buffer.
 *
 * **The server database is the source of truth**, IndexedDB is its reflection. It
 * is not a second truth: it is the price of the gym. The scorer's table writes on
 * every gesture — several hundred times over two hours — and without a local
 * store those writes would be either one network round trip per tap, which stops
 * dead without coverage, or an in-memory buffer, which dies when the phone locks.
 *
 * Enabled only if `VITE_SYNC_URL` is set — otherwise the application stays 100%
 * local: nothing written to the queue, no network call.
 */
const BASE = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/+$/, '') || ''
export const remoteEnabled = (): boolean => BASE !== ''

/** The hydration cursor: the highest write number already seen. */
const REV_KEY = 'swish-sync-rev'
/**
 * The write token, entered once per device.
 *
 * It is not in the bundle, unlike the three access codes: those guard a door the
 * client opens for itself, this one is checked by the server. It lives in
 * `localStorage` rather than `sessionStorage`, like the player identity: it is a
 * device setting, not a session.
 */
export const TOKEN_KEY = 'swish-sync-token'

export const token = (): string => localStorage.getItem(TOKEN_KEY) ?? ''
export const setToken = (v: string) => {
  if (v) localStorage.setItem(TOKEN_KEY, v)
  else localStorage.removeItem(TOKEN_KEY)
}

const headers = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-swish-token': token(),
})

type Kind = OutboxItem['kind']

interface RemoteState {
  rev: number
  docs: { kind: Kind; id: string; doc: unknown }[]
  /** The `kind:id` pairs the database **still** holds. */
  alive: string[]
}

/** What the last sync attempt gave. The interface uses it to tell the
 *  administrator whether their token passes, rather than failing silently the way
 *  the Redis version did. */
export type State = 'idle' | 'ok' | 'token' | 'network'
let lastState: State = 'idle'
export const syncState = (): State => lastState

/** What a screen needs to know: where the sending stands, and how many actions are
 *  still waiting. The count is the honest measure — it grows when things jam. */
export interface Health { state: State; pending: number }

/* We announce rather than make callers poll. Polling the Dexie table would work,
   but `doFlush` knows exactly when the state changes: having it say so costs less
   and does not manufacture latency between a failure and its display. */
const listeners = new Set<(s: Health) => void>()

/** Subscribes to the health of the synchronisation. Returns an unsubscribe. */
export function onHealth(f: (s: Health) => void): () => void {
  listeners.add(f)
  void notify()
  return () => { listeners.delete(f) }
}

async function notify(): Promise<void> {
  if (!listeners.size) return
  const pending = await db.outbox.count()
  for (const f of listeners) f({ state: lastState, pending })
}

async function readState(): Promise<RemoteState | null> {
  if (!BASE) return null
  const since = Number(localStorage.getItem(REV_KEY)) || 0
  try {
    const r = await fetch(`${BASE}/state?since=${since}`, { headers: headers() })
    if (r.status === 401 || r.status === 503) { lastState = 'token'; return null }
    if (!r.ok) { lastState = 'network'; return null }
    lastState = 'ok'
    return (await r.json()) as RemoteState
  } catch { lastState = 'network'; return null }
}

/* A document's kind says which mirror table it files under. The primary key is not
   always `id`: a message is filed under its club, a call-up under its game. The
   sweep below reads each table's primary keys, so it follows those choices without
   having to know them. */
const TABLES = {
  team: db.teams, player: db.players, match: db.matches,
  result: db.results, convocation: db.convocations, training: db.trainings,
  play: db.plays, message: db.messages,
} as const

/**
 * Brings the local mirror in line with the source of truth.
 *
 * Two halves, and it is the second one people forget. `docs` carries what changed.
 * `alive` says what the database still holds: anything absent from it is deleted
 * locally. That is how a deletion propagates, since it really removes the row
 * server-side and leaves no trace to carry around.
 *
 * **A hydration wins, including when it is empty.** The server is authoritative
 * without exception — that is the property this work exists to establish, and a
 * compassionate regression would love to break it.
 *
 * One reservation, and it is not really one: whatever waits in the queue is not
 * erased. That is not stale data the server would ignore, it is a write the person
 * has just made and that has not left yet.
 */
export async function hydrate(): Promise<boolean> {
  const s = await readState()
  if (!s) return false

  const pending = new Set((await db.outbox.toArray()).map((o) => `${o.kind}:${o.id}`))
  const alive = new Set(s.alive)

  // All eight tables, not only those `docs` touches: the sweep for the dead reads
  // the primary keys of each. Dexie wants them in an array beyond five.
  await db.transaction('rw', Object.values(TABLES), async () => {
    // The document comes from the server as it was filed there. The cast assumes
    // what TypeScript cannot check here: each kind has its table, and `KINDS`
    // server-side rejects anything that is not one.
    for (const d of s.docs) await (TABLES[d.kind] as Table<unknown, string> | undefined)?.put(d.doc)
    for (const [kind, table] of Object.entries(TABLES) as [Kind, (typeof TABLES)[Kind]][]) {
      const ids = (await table.toCollection().primaryKeys()) as string[]
      const dead = ids.filter((id) => !alive.has(`${kind}:${id}`) && !pending.has(`${kind}:${id}`))
      if (dead.length) await table.bulkDelete(dead)
    }
  })

  localStorage.setItem(REV_KEY, String(s.rev))
  return true
}

/** Refreshes from the server (to call when a list page opens). */
export async function refresh(): Promise<void> { if (BASE) await hydrate() }

// --- Outgoing queue ---

async function enqueue(op: Omit<OutboxItem, 'ts' | 'seq' | 'modifiedAt'>): Promise<void> {
  if (!BASE) return // local mode: nothing to synchronise
  // The timestamp is stamped HERE, at the moment of the gesture, and not on arrival
  // at the server. That is what makes the most recent *modification* win rather
  // than the most recently *received* one: a queue held up for two hours by a gym
  // with no coverage does not overwrite a correction made meanwhile on another
  // device.
  await db.outbox.add({ ...op, ts: Date.now(), modifiedAt: new Date().toISOString() })
  void notify()
  flush()
}
export const enqueuePut = (kind: Kind, id: string, doc: unknown) => enqueue({ kind, op: 'put', id, doc })
export const enqueueDel = (kind: Kind, id: string) => enqueue({ kind, op: 'del', id })

let flushing = false
let timer: ReturnType<typeof setTimeout> | undefined

/** Empties the queue towards the server (deduplicated per entity). Debounced by default. */
export function flush(delay = 700): void {
  if (!BASE) return
  clearTimeout(timer)
  timer = setTimeout(() => { void doFlush() }, delay)
}

async function doFlush(): Promise<void> {
  if (!BASE || flushing) return
  flushing = true
  try {
    const items = await db.outbox.orderBy('seq').toArray()
    if (items.length) {
      // Deduplication: only the last operation per (kind:id) is kept.
      const byKey = new Map<string, OutboxItem>()
      for (const it of items) byKey.set(`${it.kind}:${it.id}`, it)
      const ops = [...byKey.values()].map((it) => ({
        kind: it.kind, op: it.op, id: it.id, modifiedAt: it.modifiedAt,
        ...(it.op === 'put' ? { doc: it.doc } : {}),
      }))
      const body = JSON.stringify({ ops })
      /*
       * `keepalive` lets the send outlive the closing of the tab — precious when
       * someone quits the application right after an entry. But the browser
       * **caps it at 64 KB**, and beyond that `fetch` fails outright, without ever
       * reaching the network.
       *
       * This is not theoretical: a single game weighs tens of kilobytes once its
       * event log is serialised, and a first send catching up on a season goes well
       * past the threshold. The failure landed in the `catch` along with network
       * outages, so the queue retried forever a send that could not succeed.
       *
       * Past the threshold we therefore send without `keepalive`: a large batch lost
       * on closing stays in the queue and leaves again at the next start, which is
       * infinitely preferable to a batch that never leaves at all.
       */
      const r = await fetch(`${BASE}/mutate`, {
        method: 'POST', headers: headers(), body,
        keepalive: new Blob([body]).size < 60_000,
      })
      // A rejected token is not a network incident: retrying will achieve nothing
      // until someone fixes the setting. We keep the queue — the writes are not
      // lost — and let the admin screen say so.
      if (r.status === 401 || r.status === 503) lastState = 'token'
      else if (r.ok) { lastState = 'ok'; await db.outbox.bulkDelete(items.map((i) => i.seq!)) }
      else lastState = 'network'
    }
  } catch { lastState = 'network' } finally {
    flushing = false
    await notify()
  }
}

// Empties the queue as soon as the connection comes back.
if (typeof window !== 'undefined' && BASE) window.addEventListener('online', () => flush(0))

/** Forces an immediate send of the queue and lets callers await it. To be used
 *  after a write the user may follow with a navigation: without it, the debounce
 *  leaves a window during which a hydration would overwrite the write with a server
 *  state that does not know about it yet. */
export function flushNow(): Promise<void> {
  clearTimeout(timer)
  return doFlush()
}
