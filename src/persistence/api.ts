/**
 * The client's side of the source of truth.
 *
 * There is one, it is the Postgres table behind `/api`, and this module is the only
 * way to it. No local mirror, no queue, no offline mode: a read goes to the network,
 * and a write is not a write until the server has answered.
 *
 * The price is stated plainly: without the network, the application does nothing.
 * That is the trade — a scoreboard that refuses a basket is better than one showing
 * 42 while the official sheet says 40. Everything downstream depends on it: this
 * module throws rather than resolving, `useMatch` rolls the screen back, and the
 * header pill says so for as long as it lasts.
 */

const BASE = '/api'

/** The eight document kinds. The server checks the same list (`api/_db.ts`). */
export type Kind = 'team' | 'player' | 'match' | 'result' | 'convocation' | 'training' | 'play' | 'message'

/** A single write. The id is not always the document's `id` field: a call-up is
 *  filed under its game, the coach's message under its club. */
export interface Op {
  kind: Kind
  op: 'put' | 'del'
  id: string
  doc?: unknown
}

/**
 * The write token, entered once per device.
 *
 * It is not in the bundle, unlike the three access codes: those guard a door the
 * client opens for itself, this one is checked by the server. It lives in
 * `localStorage` rather than `sessionStorage`, like the player identity: it is a
 * device setting, not a session.
 */
export const TOKEN_KEY = 'swish-write-token'

export const token = (): string => localStorage.getItem(TOKEN_KEY) ?? ''
export const setToken = (v: string) => {
  if (v) localStorage.setItem(TOKEN_KEY, v)
  else localStorage.removeItem(TOKEN_KEY)
}

/** What the last exchange with the server gave. `idle` is "nothing tried yet", and it
 *  is deliberately not `ok`: announcing success before a single request would have the
 *  administration screen vouch for a token nobody has checked. `token` will not fix
 *  itself, `network` will — two failures, because they call for two reactions. */
export type State = 'idle' | 'ok' | 'token' | 'network'

let lastState: State = 'idle'

/* We announce rather than make callers poll: this module knows exactly when the
   state changes. The header pill listens, and it is the only thing standing between
   a failed save and a volunteer who never learns of it. */
const listeners = new Set<(s: State) => void>()

/** Subscribes to the state of the link with the server. Returns an unsubscribe. */
export function onState(f: (s: State) => void): () => void {
  listeners.add(f)
  f(lastState)
  return () => { listeners.delete(f) }
}

function announce(s: State): void {
  lastState = s
  for (const f of listeners) f(s)
}

/** Turns a failed exchange into the right state, then into an exception. Callers
 *  must not carry on as though the write had landed. */
function fail(status?: number): never {
  announce(status === 401 || status === 503 ? 'token' : 'network')
  throw new Error(status ? `api ${status}` : 'api unreachable')
}

/**
 * The short-lived copy of what the server just said.
 *
 * Not a mirror, and not a step back towards the local-first version that was taken
 * out: nothing is stored, nothing survives a reload, and no write ever reads from
 * here. It answers one thing — a screen mounted twice in a row asked the same
 * question twice, and the second answer cannot have changed.
 *
 * Without it every navigation replayed the whole read. Going back to the schedule you
 * were looking at three seconds earlier re-downloaded every match sheet, events
 * included — ninety kilobytes for five games — through a cold serverless function and
 * a fresh Postgres connection. That is the "even when I come back to a page I have
 * just seen" this fixes.
 *
 * Three rules make it safe, and all three matter:
 *
 * **The promise is cached, not the value.** The dashboard asks for five kinds while
 * the club gate is still asking for the teams; the second caller joins the request in
 * flight instead of opening a second one.
 *
 * **A write empties it, all of it.** A cascade reads before it writes, and a cascade
 * reading its own stale list is how debris survives a deletion. `mutate` is the only
 * way to write, so this is the only place that has to remember it.
 *
 * **It expires.** Fifteen seconds is longer than a navigation and shorter than a
 * decision. It is what bounds the one thing this costs: a second device's write is
 * invisible here until the window passes. The spectator page does not pay it — it
 * polls `/api/match/:id` through `spectator.ts`, which never comes past this module.
 */
const FRESH = 15_000

const fresh = new Map<string, { at: number; answer: Promise<unknown> }>()

/** Empties the copy. Called by every write, and by the test suite between two cases —
 *  a fixture filed straight into the store bypasses `mutate`, so nothing else would
 *  tell us the world changed. */
export function forget(): void { fresh.clear() }

function cached<T>(key: string, ask: () => Promise<T>): Promise<T> {
  const held = fresh.get(key)
  if (held && Date.now() - held.at < FRESH) return held.answer as Promise<T>
  const answer = ask()
  fresh.set(key, { at: Date.now(), answer })
  // A refused answer is not an answer to keep: cached, one network hiccup would be
  // replayed to every screen for fifteen seconds.
  answer.catch(() => { if (fresh.get(key)?.answer === answer) fresh.delete(key) })
  return answer
}

/** Every document of a kind. The lists are club-sized; there is no pagination and
 *  no need for one. */
export function list<T>(kind: Kind): Promise<T[]> {
  return cached(`docs?kind=${kind}`, async () => {
    let r: Response
    try { r = await fetch(`${BASE}/docs?kind=${kind}`) } catch { fail() }
    if (!r.ok) fail(r.status)
    announce('ok')
    return (await r.json()) as T[]
  })
}

/** One document, or `undefined` when the database does not hold it. A missing
 *  document is an answer, not a failure: it is what a stale link looks like. */
export function get<T>(kind: Kind, id: string): Promise<T | undefined> {
  const path = `docs?kind=${kind}&id=${encodeURIComponent(id)}`
  return cached(path, async () => {
    let r: Response
    try { r = await fetch(`${BASE}/${path}`) } catch { fail() }
    if (r.status === 404) { announce('ok'); return undefined }
    if (!r.ok) fail(r.status)
    announce('ok')
    return (await r.json()) as T
  })
}

/**
 * Applies a batch of writes, all or nothing.
 *
 * The batch is not an optimisation: a cascade (deleting a team takes its players,
 * its results, its sessions, its plays and its message) must not land half-applied,
 * and one transaction is the only way to promise that. See `repositories.ts`.
 *
 * Throws when the server did not take the writes. Callers that show the result of a
 * write must let that exception through — a screen that swallows it goes back to
 * showing a state the database does not have.
 */
export async function mutate(ops: Op[]): Promise<void> {
  if (!ops.length) return
  let r: Response
  try {
    r = await fetch(`${BASE}/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-swish-token': token() },
      body: JSON.stringify({ ops }),
    })
  } catch { fail() }
  if (!r.ok) fail(r.status)
  // Before `announce`, and unconditionally: whatever the screens read a moment ago,
  // the database no longer holds it.
  forget()
  announce('ok')
}

/**
 * Does the server accept this device's token?
 *
 * It has to be a **write** that asks. `GET /api/docs` is public, so a read succeeds
 * just as well for a device that has never been handed a token: answering from a read
 * would vouch for a typo, and the first real write would fail two hours later, in a
 * gym. Hence this empty batch — it goes through the whole check and changes nothing.
 */
export async function checkToken(): Promise<State> {
  try {
    const r = await fetch(`${BASE}/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-swish-token': token() },
      body: JSON.stringify({ ops: [] }),
    })
    announce(r.status === 401 || r.status === 503 ? 'token' : r.ok ? 'ok' : 'network')
  } catch { announce('network') }
  return lastState
}
