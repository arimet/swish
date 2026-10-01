import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { appendEvent } from '../domain/reducer'
import { diffEvents, mergeSheet, NO_PENDING, revertWrite, track, untrack, type Pending } from '../domain/sync'
import { newId } from '../domain/ids'
import { saveSheet } from '../persistence/repositories'
import { docKey, useMatchDoc } from '../persistence/queries'
import { fetchBundle, subscribeBundle, type SpectatorBundle } from './spectator'
import { useT } from '../i18n'
import type { GameEvent, Match } from '../domain/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

/**
 * The match sheet, at the scorer's table.
 *
 * **There is no separate copy of the sheet any more.** It used to live in a `useState`
 * beside a `useRef`, the ref existing only so that two taps in the same tick did not
 * both start from a stale game. The query cache is now that single copy: the read fills
 * it, `persist` writes the next sheet into it, and `WriteBridge` confirms it when the
 * server accepts. The screen and the cache cannot disagree, because there is only one.
 *
 * **The write is a plain call and not a `useMutation`, and that is a decision.** React
 * Query's optimistic pattern applies the new state in `onMutate`, which it invokes
 * asynchronously — one microtask after the handler returns. At this table two taps land
 * in the same tick, and the second must already see the first: with `onMutate` it read
 * the sheet from before both, and the first tap's event was lost. That defect has a
 * test ("two synchronous dispatches"), because it shipped once. So the optimistic
 * apply below is **synchronous**, which no mutation lifecycle can be, and wrapping the
 * remaining `await` in a `useMutation` would buy a spinner nobody shows.
 *
 * **A tap writes one event, not the sheet.** `saveSheet` sends what changed — the
 * events added, the ids archived — so a second device on the same game adds its own
 * rows instead of overwriting these. Both devices follow the game through the live
 * stream.
 *
 * The read is `useQuery` all the same, and that is where the library pays here: the
 * sheet is cached, it refetches when a phone that slept comes back, and the summary
 * screen opens on it without a round trip.
 */
export function useMatch(matchId: string) {
  const translate = useT()
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const key = docKey('match', matchId)
  const { data } = useMatchDoc(matchId)
  const match = data ?? null

  /** This device's writes the server has not shown back yet. See `mergeSheet`. */
  const pending = useRef<Pending>(NO_PENDING)
  /** The writes leave one after the other, in the order of the taps: an undo sent
   *  before the basket it undoes would archive nothing, and the basket would land. */
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  /** How many stream messages have arrived. A one-off re-read (see `persist`) is stale
   *  once one has. */
  const messages = useRef(0)

  /** Files a server message as the screen's sheet, with this device's pending writes
   *  laid over it. */
  const apply = useCallback((b: SpectatorBundle) => {
    const { match: merged, pending: next } = mergeSheet(b.match, pending.current)
    pending.current = next
    client.setQueryData(docKey('match', matchId), merged)
  }, [client, matchId])

  /* The same stream as the spectator page. Each message is the game as the database
     holds it — another device's taps included. */
  useEffect(() => subscribeBundle(matchId, (b) => { messages.current++; apply(b) }), [matchId, apply])

  /**
   * Applies the state to the screen, saves it, and **rolls back** if the save fails.
   *
   * The optimism is deliberate: at the scorer's table, entry must answer the finger
   * without waiting for the network. The rollback is what makes it honest. Without it
   * a failed write leaves the screen showing a basket the database does not have — the
   * scoreboard says 42, the database 40, and the point vanishes on reload. For an
   * official score, a state that lies is worse than an action refused.
   *
   * `cancelQueries` is not ceremony: a refetch in flight — one started by a window
   * regaining focus mid-game — would otherwise land after this and put the sheet from
   * before the tap back on screen. It is not awaited, because the apply on the line
   * below must stay synchronous; cancelling is fire-and-forget by nature.
   *
   * Nothing is written back on success: the stream brings the game as the database
   * holds it, and `mergeSheet` retires this write once it shows.
   *
   * Returns the outcome, because "Finish" navigates out of the game right after:
   * leaving in the belief the game is closed when nothing was written is the same
   * deception one notch further on.
   */
  const persist = useCallback(async (next: Match): Promise<boolean> => {
    const previous = client.getQueryData<Match | null>(key) ?? null
    void client.cancelQueries({ queryKey: key })
    client.setQueryData(key, next)
    setError(null)
    const { add, archive } = diffEvents(previous?.events ?? [], next.events)
    pending.current = track(pending.current, add, archive)
    const write = chain.current.then(() => saveSheet(previous, next))
    chain.current = write.catch(() => undefined)
    try {
      await write
      return true
    } catch {
      pending.current = untrack(pending.current, add, archive)
      const now = client.getQueryData<Match | null>(key)
      client.setQueryData(key, now && previous ? revertWrite(now, previous, next, add, archive) : previous)
      /* A failure may be a lost answer, not a refusal: the write may have landed and the
         stream already shown it, and it only speaks again when the game changes. So the
         server is asked once, and it is the judge. Unless a stream message arrives before
         the answer: that one is newer, it has settled the question already, and applying
         the older answer over it could hide a tap made since. */
      const seen = messages.current
      void fetchBundle(matchId).then((b) => { if (b && messages.current === seen) apply(b) })
      setError(translate('error.save'))
      return false
    }
  }, [client, key, matchId, apply, translate])

  /** The sheet as it stands, read from the cache rather than from a render's closure:
   *  two taps in the same tick must not both start from the same game. */
  const current = useCallback(() => client.getQueryData<Match | null>(key) ?? null, [client, key])

  const dispatch = useCallback(async (input: EventInput) => {
    const sheet = current()
    if (!sheet) return
    const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
    /* Two causes of failure, two treatments, and they must not share a `catch`.
       `appendEvent` throws deliberate rulebook messages ("Cannot score before the clock
       starts."): they are shown as they are, and nothing has been applied. A write
       failure is a technical exception, and showing one to a volunteer mid-game tells
       them nothing they can act on — `persist` turns it into `error.save`. */
    let next: Match
    try {
      next = appendEvent(sheet, event)
    } catch (e) {
      // The domain returns a rule key, not a sentence: see `validateEvent`.
      setError(translate((e as Error).message))
      return
    }
    await persist(next)
  }, [current, persist, translate])

  /** Chains several events into a single atomic state/save — stops a second
   * synchronous dispatch from overwriting the first by starting from a stale game. */
  const dispatchMany = useCallback(async (inputs: EventInput[]) => {
    const sheet = current()
    if (!sheet) return
    let next = sheet
    try {
      for (const input of inputs) {
        const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
        next = appendEvent(next, event)
      }
    } catch (e) {
      setError(translate((e as Error).message))
      return
    }
    await persist(next)
  }, [current, persist, translate])

  /** Removes events, whichever they are, in one write: the history's "Delete". */
  const remove = useCallback(async (ids: string[]) => {
    const sheet = current()
    const gone = new Set(ids)
    if (!sheet || !sheet.events.some((e) => gone.has(e.id))) return
    await persist({ ...sheet, events: sheet.events.filter((e) => !gone.has(e.id)) })
  }, [current, persist])

  /**
   * Writes events at a given place in the log rather than at the end: in place of the
   * event `at.id` (the history's "Modify"), or right after it (what follows a modified
   * basket — its pass, its and-one). The caller gives them the period and game clock
   * of the action they replace. Returns the new ids, `[]` when nothing was written.
   */
  const rewrite = useCallback(async (inputs: EventInput[], at: { id: string; mode: 'replace' | 'after' }): Promise<string[]> => {
    const sheet = current()
    if (!sheet) return []
    const i = sheet.events.findIndex((e) => e.id === at.id)
    if (i < 0) return []
    const rest = at.mode === 'replace' ? [...sheet.events.slice(0, i), ...sheet.events.slice(i + 1)] : sheet.events
    const created = inputs.map((input) => ({ ...input, id: newId(), wallClock: Date.now() }) as GameEvent)
    try {
      // The rules read the log as it will stand; the order they see does not matter
      // to them, only what is in it.
      created.reduce((m, e) => appendEvent(m, e), { ...sheet, events: rest })
    } catch (e) {
      setError(translate((e as Error).message))
      return []
    }
    const cut = at.mode === 'replace' ? i : i + 1
    const events = [...rest.slice(0, cut), ...created, ...rest.slice(cut)]
    return (await persist({ ...sheet, events })) ? created.map((e) => e.id) : []
  }, [current, persist, translate])

  /** Closes the game for good (spec §8): moves the status to 'finished' and saves.
   *  Returns `false` if the write failed — the caller must then not leave the game,
   *  it is not finished. */
  const finish = useCallback(async (): Promise<boolean> => {
    const sheet = current()
    if (!sheet) return false
    return persist({ ...sheet, status: 'finished' })
  }, [current, persist])

  return { match, dispatch, dispatchMany, remove, rewrite, finish, error }
}
