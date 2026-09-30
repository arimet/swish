import type { GameEvent, Match } from '../domain/types'

/**
 * The API, in memory, for the test suite.
 *
 * There is no local store any more: a screen with no server has no data at all, so
 * every test needs one. This is it — the two routes the application calls
 * (`GET /api/docs`, `POST /api/mutate`) plus the public spectator bundle, over a
 * `Map`.
 *
 * A `put` replaces the stored document, exactly as `api/mutate` does — except a
 * game's events, which only `/api/match/:id/events` writes.
 *
 * Writing is accepted without a token: the token is the server's business and has
 * its own test (`persistence/api.test.ts`). Modelling a *valid* token here keeps
 * every other test about the screen it is testing.
 */

const store = new Map<string, unknown>()
/** Keys deleted through `/api/mutate`, i.e. archived on the server. */
const archived = new Set<string>()

const key = (kind: string, id: string) => `${kind}:${id}`

/* The three helpers below write **straight into the store**, past `/api/mutate`, and
   that is the point: they are a test's arrangement, not a gesture under test. Nothing
   announces them, so nothing invalidates a query — which is why `src/test/render.tsx`
   builds a fresh, empty query client per case rather than trying to keep one in step
   with fixtures filed behind its back. */

/** Empties the database between two tests. Called for every test by `setupTests`. */
export const resetStore = () => { store.clear(); archived.clear() }

/** Drops every document of a kind. Some tests file a fixture in `beforeEach` and then
 *  need one kind emptied to describe their own case ("a player with no game"). */
export const clear = (kind: string) => {
  for (const k of [...store.keys()]) if (k.startsWith(`${kind}:`)) store.delete(k)
}

/** Files a document directly, bypassing the API — the arrangement half of a test. */
export const put = (kind: string, id: string, doc: unknown) => { store.set(key(kind, id), doc); archived.delete(key(kind, id)) }

/**
 * What the `active_*` views hide: a document whose parent is gone. The server archives
 * rather than deletes, and archiving a team hides its players, games, results, sessions,
 * plays and message; the fake deletes the one document and hides the rest the same way.
 * Call-ups and sessions also drop the ids of players and plays no longer visible.
 */
const has = (kind: string, id: string | undefined) => !!id && !archived.has(key(kind, id))
function visible(kind: string, d: Record<string, unknown>): Record<string, unknown> | undefined {
  switch (kind) {
    case 'player': return has('team', d.teamId as string) ? d : undefined
    case 'match': {
      const meta = d.meta as { clubId?: string; opponentId?: string } | undefined
      return has('team', meta?.clubId) && has('team', meta?.opponentId) ? d : undefined
    }
    case 'result': return has('team', d.homeId as string) && has('team', d.awayId as string) ? d : undefined
    case 'training': {
      if (!has('team', d.clubId as string)) return undefined
      const ids = (d.playIds as string[] | undefined)?.filter((id) => { const p = store.get(key('play', id)); return !!p && !!visible('play', p as never) })
      const rest = { ...d }
      delete rest.playIds
      return ids?.length ? { ...rest, playIds: ids } : rest
    }
    case 'play': case 'message': return has('team', d.clubId as string) ? d : undefined
    case 'convocation': {
      const m = store.get(key('match', d.matchId as string)) as Record<string, unknown> | undefined
      if (archived.has(key('match', d.matchId as string)) || (m && !visible('match', m))) return undefined
      return { ...d, playerIds: (d.playerIds as string[]).filter((id) => { const p = store.get(key('player', id)); return !!p && !!visible('player', p as never) }) }
    }
    default: return d
  }
}

/** Reads a document back, to assert on what a screen actually wrote. */
export const doc = <T>(kind: string, id: string): T | undefined => {
  const d = store.get(key(kind, id)) as Record<string, unknown> | undefined
  return (d && visible(kind, d)) as T | undefined
}

/** Every document of a kind, in insertion order. */
export const docs = <T>(kind: string): T[] =>
  [...store.entries()].filter(([k]) => k.startsWith(`${kind}:`))
    .map(([, v]) => visible(kind, v as Record<string, unknown>)).filter(Boolean) as T[]

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
    if (ops.some((o) => o.kind === 'convocation' && o.op === 'del')) return json({ error: 'convocations cannot be archived on its own' }, 400)
    for (const o of ops) {
      if (o.op === 'del') { store.delete(key(o.kind, o.id)); archived.add(key(o.kind, o.id)) }
      else {
        if (o.kind === 'match') {
          // As the server: a game's `put` never writes its events.
          const stored = store.get(key('match', o.id)) as Match | undefined
          store.set(key('match', o.id), { ...(o.doc as Match), events: stored?.events ?? [] })
        } else store.set(key(o.kind, o.id), o.doc)
        archived.delete(key(o.kind, o.id))
      }
    }
    return new Response(null, { status: 204 })
  }

  const events = path.match(/^\/api\/match\/([^/]+)\/events$/)
  if (events) {
    const id = decodeURIComponent(events[1])
    const m = store.get(key('match', id)) as Match | undefined
    if (!m) return json({ error: 'match_events_match_id_fkey' }, 400)
    const { add = [], archive = [] } = JSON.parse(String(init?.body ?? '{}')) as { add?: GameEvent[]; archive?: string[] }
    const known = new Set(m.events.map((e) => e.id))
    const gone = new Set(archive)
    store.set(key('match', id), { ...m, events: [...m.events, ...add.filter((e) => !known.has(e.id))].filter((e) => !gone.has(e.id)) })
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
