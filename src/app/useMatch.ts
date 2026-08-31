import { useCallback, useEffect, useRef, useState } from 'react'
import { appendEvent, undoLast, removeLastEvent } from '../domain/reducer'
import { newId } from '../domain/ids'
import { getMatch, saveMatch } from '../persistence/repositories'
import { useT } from '../i18n'
import type { GameEvent, Match } from '../domain/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

export function useMatch(matchId: string) {
  const translate = useT()
  const [match, setMatch] = useState<Match | null>(null)
  const [error, setError] = useState<string | null>(null)
  const matchRef = useRef<Match | null>(null)

  const apply = (next: Match) => { matchRef.current = next; setMatch(next) }

  /**
   * Applies the state to the screen, saves it, and **rolls back** if the save fails.
   *
   * The optimism is deliberate: at the scorer's table, entry must answer the finger
   * without waiting for the network. The rollback is what makes it honest. Without it
   * a failed write leaves the screen showing a basket the database does not have — the
   * scoreboard says 42, the database 40, and the point vanishes on reload. For an
   * official score, a state that lies is worse than an action refused.
   *
   * Returns the outcome, because "Finish" navigates out of the game right after:
   * leaving in the belief the game is closed when nothing was written is the same
   * deception one notch further on.
   */
  const persist = useCallback(async (next: Match, previous: Match): Promise<boolean> => {
    apply(next); setError(null)
    try {
      await saveMatch(next)
      return true
    } catch {
      apply(previous)
      setError(translate('error.save'))
      return false
    }
  }, [translate])

  useEffect(() => {
    getMatch(matchId).then((m) => { matchRef.current = m ?? null; setMatch(m ?? null) })
  }, [matchId])

  const dispatch = useCallback(async (input: EventInput) => {
    const current = matchRef.current
    if (!current) return
    const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
    /* Two causes of failure, two treatments, and they must not share a `catch`.
       `appendEvent` throws deliberate rulebook messages ("Cannot score before the clock
       starts."): they are shown as they are, and nothing has been applied. A write
       failure is a technical exception, and showing one to a volunteer mid-game tells
       them nothing they can act on — `persist` turns it into `error.save`. */
    let next: Match
    try {
      next = appendEvent(current, event)
    } catch (e) {
      // The domain returns a rule key, not a sentence: see `validateEvent`.
      setError(translate((e as Error).message))
      return
    }
    await persist(next, current)
  }, [persist, translate])

  /** Chains several events into a single atomic state/save — stops a second
   * synchronous dispatch from overwriting the first by starting from a stale game. */
  const dispatchMany = useCallback(async (inputs: EventInput[]) => {
    const current = matchRef.current
    if (!current) return
    let next = current
    try {
      for (const input of inputs) {
        const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
        next = appendEvent(next, event)
      }
    } catch (e) {
      setError(translate((e as Error).message))
      return
    }
    await persist(next, current)
  }, [persist, translate])

  const undo = useCallback(async () => {
    const current = matchRef.current
    if (!current) return
    await persist(undoLast(current), current)
  }, [persist])

  /** Targeted correction: removes the last event satisfying the predicate. */
  const removeLast = useCallback(async (predicate: (e: GameEvent) => boolean) => {
    const current = matchRef.current
    if (!current) return
    const next = removeLastEvent(current, predicate)
    if (next === current) return
    await persist(next, current)
  }, [persist])

  /** Closes the game for good (spec §8): moves the status to 'finished' and saves.
   *  Returns `false` if the write failed — the caller must then not leave the game,
   *  it is not finished. */
  const finish = useCallback(async (): Promise<boolean> => {
    const current = matchRef.current
    if (!current) return false
    return persist({ ...current, status: 'finished' }, current)
  }, [persist])

  return { match, dispatch, dispatchMany, undo, removeLast, finish, error }
}
