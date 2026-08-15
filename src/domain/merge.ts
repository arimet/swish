/* The `.js` extension looks out of place in `src`, where the rest of the domain
   imports without it. It is required: this is the only file in `src` that
   `api/mutate` imports, so it also belongs to the `tsconfig.api` project, whose
   `nodenext` resolution demands it. Browser resolution accepts it; the reverse is
   not true. */
import type { GameEvent, Match } from './types.js'

/**
 * Merges two versions of a match sheet.
 *
 * The case: the coach corrects a foul from the bench while the scorer records a
 * basket. Two devices write the same game, and the last one to push must not
 * erase the other. This is the one document in the product where "most recent
 * change wins" is not enough, because the loser is not wrong — it simply recorded
 * something else.
 *
 * None of this had to be invented, because the domain already allowed for it:
 * every event carries a stable id and a wall clock.
 *
 * Called **server-side**, from `api/mutate`. It is pure and lives here with the
 * rest of the domain so it can be tested without a database or a network.
 */
export function mergeMatches(stored: Match, incoming: Match): Match {
  // Retractions from both sides: an undo made on one device holds for the other,
  // otherwise the union would resurrect what that device just removed.
  const retracted = [...new Set([...(stored.retracted ?? []), ...(incoming.retracted ?? [])])]
  const struck = new Set(retracted)

  const byId = new Map<string, GameEvent>()
  for (const e of [...stored.events, ...incoming.events]) if (!struck.has(e.id)) byId.set(e.id, e)

  // Ties break on the id, never on arrival order: both devices must end up with
  // the same log whatever order the server receives them in. Without that, the
  // merge would not be commutative and two mirrors would diverge, each showing a
  // "correct" log.
  const events = [...byId.values()].sort((a, b) => a.wallClock - b.wallClock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return {
    // `meta` and `roster` do not accumulate, they replace: the most recent write
    // carries them, and `api/mutate` only calls this function for a write that has
    // already won arbitration on `modified_at`.
    ...incoming,
    events,
    ...(retracted.length ? { retracted } : {}),
    status: furthest(stored.status, incoming.status),
  }
}

const RANK = { setup: 0, live: 1, finished: 2 } as const

/**
 * Status never moves backwards.
 *
 * A device that spent an hour offline empties its queue carrying a stale
 * `status: 'live'`: it must not un-finish a game closed in the meantime. This is
 * the one field where a late overwrite would be both visible and wrong — a
 * reopened match sheet suggests you can still correct it.
 */
export function furthest(a: Match['status'], b: Match['status']): Match['status'] {
  return RANK[a] >= RANK[b] ? a : b
}
