import { useCallback, useEffect, useRef, useState } from 'react'
import { appendEvent, undoLast, removeLastEvent } from '../domain/reducer'
import { newId } from '../domain/ids'
import { getMatch, saveMatch } from '../persistence/repositories'
import type { GameEvent, Match } from '../domain/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

export function useMatch(matchId: string) {
  const [match, setMatch] = useState<Match | null>(null)
  const [error, setError] = useState<string | null>(null)
  const matchRef = useRef<Match | null>(null)

  const apply = (next: Match) => { matchRef.current = next; setMatch(next) }

  useEffect(() => {
    getMatch(matchId).then((m) => { matchRef.current = m ?? null; setMatch(m ?? null) })
  }, [matchId])

  const dispatch = useCallback(async (input: EventInput) => {
    const current = matchRef.current
    if (!current) return
    const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
    try {
      const next = appendEvent(current, event)
      apply(next); setError(null)
      await saveMatch(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  /** Enchaîne plusieurs évènements en un seul état/sauvegarde atomique — évite qu'un
   * second dispatch synchrone n'écrase le premier en repartant d'un match périmé. */
  const dispatchMany = useCallback(async (inputs: EventInput[]) => {
    const current = matchRef.current
    if (!current) return
    try {
      let next = current
      for (const input of inputs) {
        const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
        next = appendEvent(next, event)
      }
      apply(next); setError(null)
      await saveMatch(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const undo = useCallback(async () => {
    const current = matchRef.current
    if (!current) return
    const next = undoLast(current)
    apply(next); setError(null)
    await saveMatch(next)
  }, [])

  /** Correction ciblée : retire le dernier évènement satisfaisant le prédicat. */
  const removeLast = useCallback(async (predicate: (e: GameEvent) => boolean) => {
    const current = matchRef.current
    if (!current) return
    const next = removeLastEvent(current, predicate)
    if (next === current) return
    apply(next); setError(null)
    await saveMatch(next)
  }, [])

  /** Clôture définitivement le match (spec §8) : passe le statut à 'finished' et persiste. */
  const finish = useCallback(async () => {
    const current = matchRef.current
    if (!current) return
    const next: Match = { ...current, status: 'finished' }
    apply(next); setError(null)
    await saveMatch(next)
  }, [])

  return { match, dispatch, dispatchMany, undo, removeLast, finish, error }
}
