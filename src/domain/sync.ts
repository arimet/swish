import type { GameEvent } from './types'

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
