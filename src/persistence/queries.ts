import { QueryClient, useQuery, useQueryClient, type QueryObserverOptions, type UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { onWrite, type Kind } from './api'
import {
  getConvocation, getMatch, getMessage, getPlay, getPlayer, getTeam,
  listAllPlayers, listAllPlays, listMatches, listResults, listTeams, listTrainings,
} from './repositories'
import type { Convocation, Match, Player, ReportedResult, Team, TeamMessage, Training } from '../domain/types'
import type { Play } from '../domain/plays'

/**
 * Every read in the application, as React Query queries.
 *
 * The screens used to fetch in `useEffect` and hold the answer in `useState`, which
 * meant a screen re-read everything each time it mounted: coming back to the schedule
 * you were looking at three seconds earlier replayed its whole read. What replaced it
 * is not a cache bolted on the side — it is this file, and the three things it buys
 * that a cache cannot:
 *
 * **Stale-while-revalidate.** Past `STALE`, a screen shows what it has *immediately*
 * and refetches behind it. Nothing waits for the network to draw.
 *
 * **A refetch when the device comes back.** A phone that slept through half-time, a
 * tab left open in the stands, a 4G hole in a gym: on focus and on reconnect the
 * screens catch up on their own. This is the one thing the hand-rolled cache could
 * never do — it could only bound how long it lied.
 *
 * **Invalidation by key.** A write announces the kinds it touched and only those keys
 * are dropped. Deleting a player no longer costs the schedule its match sheets.
 *
 * ONE CACHE ENTRY PER KIND, and the callers derive from it. `listPlayers(teamId)` and
 * `listPlays(clubId)` filter a club-sized list in memory — so they are `select` over
 * the kind's one entry, not a query of their own. Two teams' rosters share a single
 * request, and a write invalidates one thing rather than a family of near-duplicates.
 */

/**
 * How long an answer counts as fresh. Under it, a navigation costs nothing at all:
 * no request, no refetch, no flicker. Over it, the screen still draws instantly from
 * the cache and the refetch happens behind it.
 *
 * Thirty seconds, and the number is not arbitrary: it is longer than the walk from
 * the dashboard to the schedule and back, and shorter than any decision anyone takes
 * on this data. It is not a staleness bound the way the old fifteen seconds was —
 * focus, reconnect and writes all refetch regardless of it.
 */
const STALE = 30_000

/** `['doc', kind]` is the kind's list; `['doc', kind, id]` is one document. So
 *  invalidating `['doc', kind]` reaches both, which is what a write wants: it knows
 *  the kind it touched, and the cascade behind it may have touched any id. */
export const docKey = (kind: Kind, id?: string) => id ? ['doc', kind, id] as const : ['doc', kind] as const

/* React Query refuses `undefined` as query data — it is how it spells "nothing has
   loaded yet". But `get` returns `undefined` for a document the database does not
   hold, which is an *answer*: a stale share link, a game with no call-up. So the
   absence is carried as `null`, and the screens read it as such. */
const absent = <T>(p: Promise<T | undefined>): Promise<T | null> => p.then((v) => v ?? null)

/* Module scope, so its identity never changes: a `select` rebuilt each render hands
   back a new object every time. See the note on `usePlayers`. */
const byId = (ts: Team[]): Record<string, Team> => Object.fromEntries(ts.map((t) => [t.id, t]))

const tally = (ps: Player[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const p of ps) out[p.teamId] = (out[p.teamId] ?? 0) + 1
  return out
}

// ---------------------------------------------------------------------------- reads

export const useTeams = (): UseQueryResult<Team[]> =>
  useQuery({ queryKey: docKey('team'), queryFn: listTeams, staleTime: STALE })

/** The teams keyed by id, which is how every screen that shows an opponent's name
 *  wants them. Derived from the one `team` entry, at module scope so its identity is
 *  stable — see the note on `usePlayers`. */
export const useTeamsById = (): UseQueryResult<Record<string, Team>> =>
  useQuery({ queryKey: docKey('team'), queryFn: listTeams, select: byId, staleTime: STALE })

export const useTeam = (id: string | null | undefined): UseQueryResult<Team | null> =>
  useQuery({ queryKey: docKey('team', id ?? ''), queryFn: () => absent(getTeam(id!)), enabled: !!id, staleTime: STALE })

/**
 * A team's roster, filtered out of the one `player` entry.
 *
 * `select` and not a query of its own — see the note at the top. The filter goes
 * through `useCallback` on purpose: React Query re-runs `select` whenever its identity
 * changes, so an inline closure would hand back a **new array every render**. Screens
 * here do run effects on their data, and a new reference each render is an infinite
 * loop, not a slow render.
 */
export const usePlayers = (teamId: string | null | undefined): UseQueryResult<Player[]> =>
  useQuery({
    queryKey: docKey('player'),
    queryFn: listAllPlayers,
    select: useCallback((ps: Player[]) => ps.filter((p) => p.teamId === teamId), [teamId]),
    enabled: !!teamId,
    staleTime: STALE,
  })

/** How many players each team has, tallied over the same one `player` entry. The
 *  teams list used to fan out one roster read per team and wait for all of them. */
export const usePlayerCounts = (): UseQueryResult<Record<string, number>> =>
  useQuery({
    queryKey: docKey('player'),
    queryFn: listAllPlayers,
    select: tally,
    staleTime: STALE,
  })

/** A team's roster keyed by id, which is what the scorer's table and the summary want:
 *  every event names a `playerId`. Same one `player` entry underneath. */
export const usePlayersById = (teamId: string | null | undefined): UseQueryResult<Record<string, Player>> =>
  useQuery({
    queryKey: docKey('player'),
    queryFn: listAllPlayers,
    select: useCallback(
      (ps: Player[]) => Object.fromEntries(ps.filter((p) => p.teamId === teamId).map((p) => [p.id, p])),
      [teamId],
    ),
    enabled: !!teamId,
    staleTime: STALE,
  })

export const usePlayer = (id: string | null | undefined): UseQueryResult<Player | null> =>
  useQuery({ queryKey: docKey('player', id ?? ''), queryFn: () => absent(getPlayer(id!)), enabled: !!id, staleTime: STALE })

export const useMatches = (): UseQueryResult<Match[]> =>
  useQuery({ queryKey: docKey('match'), queryFn: listMatches, staleTime: STALE })

export const useMatchDoc = (id: string | null | undefined): UseQueryResult<Match | null> =>
  useQuery({ queryKey: docKey('match', id ?? ''), queryFn: () => absent(getMatch(id!)), enabled: !!id, staleTime: STALE })

export const useResults = (): UseQueryResult<ReportedResult[]> =>
  useQuery({ queryKey: docKey('result'), queryFn: listResults, staleTime: STALE })

export const useTrainings = (): UseQueryResult<Training[]> =>
  useQuery({ queryKey: docKey('training'), queryFn: listTrainings, staleTime: STALE })

export const useConvocation = (matchId: string | null | undefined): UseQueryResult<Convocation | null> =>
  useQuery({ queryKey: docKey('convocation', matchId ?? ''), queryFn: () => absent(getConvocation(matchId!)), enabled: !!matchId, staleTime: STALE })

export const useMessage = (clubId: string | null | undefined): UseQueryResult<TeamMessage | null> =>
  useQuery({ queryKey: docKey('message', clubId ?? ''), queryFn: () => absent(getMessage(clubId!)), enabled: !!clubId, staleTime: STALE })

/** A club's playbook, filtered out of the one `play` entry — same shape, same reason
 *  for the `useCallback`, as `usePlayers`. */
export const usePlays = (clubId: string | null | undefined): UseQueryResult<Play[]> =>
  useQuery({
    queryKey: docKey('play'),
    queryFn: listAllPlays,
    select: useCallback((ps: Play[]) => ps.filter((p) => p.clubId === clubId), [clubId]),
    enabled: !!clubId,
    staleTime: STALE,
  })

export const usePlay = (id: string | null | undefined): UseQueryResult<Play | null> =>
  useQuery({ queryKey: docKey('play', id ?? ''), queryFn: () => absent(getPlay(id!)), enabled: !!id, staleTime: STALE })

// ----------------------------------------------------------------- the write bridge

/**
 * Wires accepted writes to the cache. Mounted once, under the provider.
 *
 * Every write in the application goes through `api.mutate`, cascades included, so one
 * subscription covers all of them and **no call site can forget to invalidate**. That
 * is the whole reason this is a bridge and not a `useMutation` per screen: the screens
 * used to call a `reload()` of their own after each write, and the defects were always
 * the forgotten one.
 *
 * It does not simply drop what changed. A batch carries the documents the server
 * accepted, and that is enough to keep the cache correct **without reading anything
 * back**:
 *
 * **A `put` is filed.** The server took exactly this document, so the entry for it is
 * now right by construction. Re-reading it would be asking the database to confirm
 * what it just told us.
 *
 * **A `del` becomes `null`**, which is how a document the database does not hold is
 * spelled everywhere here. Not `removeQueries`, which would leave a mounted screen to
 * fetch a 404 to learn what this batch already said.
 *
 * **Only the kind's list is invalidated**, and `exact` so it is the list alone. A list
 * genuinely has to be re-read — a batch says nothing about the order or about what
 * else the database holds — but only if a screen is showing one. In the play editor,
 * where releasing a marker is a write, nothing is mounted that lists plays: the
 * gesture costs one request instead of two.
 */
export function WriteBridge(): null {
  const client = useQueryClient()
  useEffect(() => onWrite((ops) => {
    for (const op of ops) {
      if (op.op === 'put') client.setQueryData(docKey(op.kind, op.id), op.doc)
      else client.setQueryData(docKey(op.kind, op.id), null)
    }
    for (const kind of new Set(ops.map((o) => o.kind))) {
      client.invalidateQueries({ queryKey: docKey(kind), exact: true })
    }
  }), [client])
  return null
}

/**
 * The client, with the defaults the application actually wants.
 *
 * A function rather than a module constant: a test needs its own, empty, per case.
 * `over` is merged **into** these defaults and applied in the constructor — not with
 * `setDefaultOptions` afterwards, which replaces the whole `queries` object and
 * silently gives back React Query's own defaults for everything not named. That cost
 * an afternoon: the test client came back with `retry: 3`, so a screen asserting on an
 * unreachable server sat in exponential backoff past every timeout.
 */
export const makeQueryClient = (over: Partial<QueryObserverOptions> = {}): QueryClient => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE,
      /**
       * **No retry**, and this is a product decision rather than a default left
       * alone. React Query retries three times with backoff out of the box, which
       * spends the better part of a minute before a screen is allowed to admit that
       * the server is silent — and this application's whole stance is to say so at
       * once. `Unreachable` and the header pill exist for exactly that.
       *
       * Nothing is lost by it, because the recovery here is stronger than a blind
       * retry: a failed read is refetched on focus, on reconnect, and on the next
       * write. A retry only delays the truth.
       */
      retry: 0,
      ...over,
    },
  },
})
