import type { Match } from '../domain/types'

/**
 * The API, in memory, for the test suite.
 *
 * There is no local store any more: a screen with no server has no data at all, so
 * every test needs one. This is it — the two routes the application calls
 * (`GET /api/docs`, `POST /api/mutate`) plus the public spectator bundle, over a
 * `Map`.
 *
 * A `put` replaces the stored document, exactly as `api/mutate` does — every kind,
 * the match sheet included.
 *
 * Writing is accepted without a token: the token is the server's business and has
 * its own test (`persistence/api.test.ts`). Modelling a *valid* token here keeps
 * every other test about the screen it is testing.
 */

const store = new Map<string, unknown>()

const key = (kind: string, id: string) => `${kind}:${id}`

/** Empties the database between two tests. Called for every test by `setupTests`. */
export const resetStore = () => store.clear()

/** Drops every document of a kind. Some tests file a fixture in `beforeEach` and then
 *  need one kind emptied to describe their own case ("a player with no game"). */
export const clear = (kind: string) => {
  for (const k of [...store.keys()]) if (k.startsWith(`${kind}:`)) store.delete(k)
}

/** Files a document directly, bypassing the API — the arrangement half of a test. */
export const put = (kind: string, id: string, doc: unknown) => { store.set(key(kind, id), doc) }

/** Reads a document back, to assert on what a screen actually wrote. */
export const doc = <T>(kind: string, id: string): T | undefined => store.get(key(kind, id)) as T | undefined

/** Every document of a kind, in insertion order. */
export const docs = <T>(kind: string): T[] =>
  [...store.entries()].filter(([k]) => k.startsWith(`${kind}:`)).map(([, v]) => v as T)

export const count = (kind: string): number => docs(kind).length

interface Op { kind: string; op: 'put' | 'del'; id: string; doc?: unknown }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** The spectator bundle, projected out of the store exactly as `api/_bundle` does —
 *  including what it leaves out of a player's record. */
function bundle(id: string): Response {
  const match = doc<Match>('match', id)
  if (!match) return json({ error: 'Game not found' }, 404)
  const clubId = match.meta?.clubId ?? ''
  const opponentId = match.meta?.opponentId ?? ''
  const name = (tid: string) => docs<{ id: string; name: string }>('team').find((t) => t.id === tid)?.name ?? ''
  return json({
    match,
    players: docs<Record<string, unknown>>('player')
      .filter((p) => p.teamId === clubId)
      .map((p) => ({ id: p.id, teamId: p.teamId, number: p.number, lastName: p.lastName, firstName: p.firstName })),
    teamNames: { A: name(clubId), B: name(opponentId) },
  })
}

async function route(url: URL, init?: RequestInit): Promise<Response> {
  const path = url.pathname

  if (path === '/api/docs') {
    const kind = url.searchParams.get('kind') ?? ''
    const id = url.searchParams.get('id')
    if (id === null) return json(docs(kind))
    const found = doc(kind, id)
    return found === undefined ? json({ error: 'not found' }, 404) : json(found)
  }

  if (path === '/api/mutate') {
    const ops = (JSON.parse(String(init?.body ?? '{}')).ops ?? []) as Op[]
    for (const o of ops) {
      if (o.op === 'del') store.delete(key(o.kind, o.id))
      else store.set(key(o.kind, o.id), o.doc)
    }
    return new Response(null, { status: 204 })
  }

  const match = path.match(/^\/api\/match\/([^/]+)$/)
  if (match) return bundle(decodeURIComponent(match[1]))

  return json({ error: `no fake route for ${path}` }, 404)
}

/** Installs the fake as the global `fetch`. Once per run is enough. */
export function installFakeApi(): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    route(new URL(String(input), 'http://localhost'), init)) as typeof fetch
}
