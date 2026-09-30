import type { GameEvent, Match } from './types'

/**
 * What changed between two versions of a sheet, as the server wants it: the events to
 * add and the ids to archive. Ids are unique, so a membership test is the whole diff —
 * an event is never edited in place, it is archived and another is added.
 */
export function diffEvents(before: GameEvent[], after: GameEvent[]): { add: GameEvent[]; archive: string[] } {
  const was = new Set(before.map((e) => e.id))
  const is = new Set(after.map((e) => e.id))
  return { add: after.filter((e) => !was.has(e.id)), archive: before.filter((e) => !is.has(e.id)).map((e) => e.id) }
}

/** This device's writes not yet seen in a server message. */
export interface Pending { added: GameEvent[]; archived: string[] }
export const NO_PENDING: Pending = { added: [], archived: [] }

/** Records a write about to leave. Archiving an event this device has not had
 *  acknowledged yet cancels it locally too: the server will receive the add, then the
 *  archive, in that order (`useMatch` sends them one after the other). */
export function track(p: Pending, add: GameEvent[], archive: string[]): Pending {
  const gone = new Set(archive)
  return { added: [...p.added.filter((e) => !gone.has(e.id)), ...add], archived: [...p.archived, ...archive] }
}

/** Drops a write the server refused. */
export function untrack(p: Pending, add: GameEvent[], archive: string[]): Pending {
  const added = new Set(add.map((e) => e.id))
  const gone = new Set(archive)
  return { added: p.added.filter((e) => !added.has(e.id)), archived: p.archived.filter((id) => !gone.has(id)) }
}

/**
 * The sheet a server message says, with this device's pending writes laid over it.
 *
 * A write stays pending until a message *shows* it — not until its request answers.
 * A message computed a moment before the write landed would otherwise take the basket
 * off the scoreboard for a second, which at the table reads as "the app lost it".
 */
export function mergeSheet(server: Match, p: Pending): { match: Match; pending: Pending } {
  const onServer = new Set(server.events.map((e) => e.id))
  const pending: Pending = {
    added: p.added.filter((e) => !onServer.has(e.id)),
    archived: p.archived.filter((id) => onServer.has(id)),
  }
  const hidden = new Set([...p.archived])
  return {
    pending: pending.added.length === p.added.length && pending.archived.length === p.archived.length ? p : pending,
    match: { ...server, events: [...server.events, ...pending.added].filter((e) => !hidden.has(e.id)) },
  }
}

/**
 * Undoes one failed write on the sheet as it is *now*, not as it was before the write.
 *
 * Restoring the whole previous sheet would also take away what arrived since — another
 * tap, another device's basket. So only this write's events leave, only its archived
 * events come back (each after the event that preceded it), and the head returns to
 * what it was.
 */
export function revertWrite(current: Match, previous: Match, add: GameEvent[], archive: string[]): Match {
  const added = new Set(add.map((e) => e.id))
  const gone = new Set(archive)
  let events = current.events.filter((e) => !added.has(e.id))
  previous.events.forEach((e, i) => {
    if (!gone.has(e.id) || events.some((x) => x.id === e.id)) return
    const after = i > 0 ? events.findIndex((x) => x.id === previous.events[i - 1].id) : -1
    events = [...events.slice(0, after + 1), e, ...events.slice(after + 1)]
  })
  return { ...current, meta: previous.meta, status: previous.status, roster: previous.roster, events }
}
