import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { appendEvent, undoLast, removeLastEvent } from '../domain/reducer'
import { newId } from '../domain/ids'
import { saveMatch } from '../persistence/repositories'
import { docKey, useMatchDoc } from '../persistence/queries'
import { useT } from '../i18n'
import type { GameEvent, Match } from '../domain/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

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
   * Nothing is written back on success. The server accepted this exact document, and
   * `WriteBridge` files it under the same key: asking the database to confirm what it
   * has just been told would be one round trip per basket.
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
    try {
      await saveMatch(next)
      return true
    } catch {
      client.setQueryData(key, previous)
      setError(translate('error.save'))
      return false
    }
  }, [client, key, translate])

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

  const undo = useCallback(async () => {
    const sheet = current()
    if (!sheet) return
    await persist(undoLast(sheet))
  }, [current, persist])

  /** Targeted correction: removes the last event satisfying the predicate. */
  const removeLast = useCallback(async (predicate: (e: GameEvent) => boolean) => {
    const sheet = current()
    if (!sheet) return
    const next = removeLastEvent(sheet, predicate)
    if (next === sheet) return
    await persist(next)
  }, [current, persist])

  /** Closes the game for good (spec §8): moves the status to 'finished' and saves.
   *  Returns `false` if the write failed — the caller must then not leave the game,
   *  it is not finished. */
  const finish = useCallback(async (): Promise<boolean> => {
    const sheet = current()
    if (!sheet) return false
    return persist({ ...sheet, status: 'finished' })
  }, [current, persist])

  return { match, dispatch, dispatchMany, undo, removeLast, finish, error }
}
