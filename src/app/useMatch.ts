import { useCallback, useEffect, useRef, useState } from 'react'
import { appendEvent, undoLast, removeLastEvent } from '../domain/reducer'
import { newId } from '../domain/ids'
import { getMatch, saveMatch } from '../persistence/repositories'
import { useT } from '../i18n'
import type { GameEvent, Match } from '../domain/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

export function useMatch(matchId: string) {
  const trad = useT()
  const [match, setMatch] = useState<Match | null>(null)
  const [error, setError] = useState<string | null>(null)
  const matchRef = useRef<Match | null>(null)

  const apply = (next: Match) => { matchRef.current = next; setMatch(next) }

  /**
   * Applique l'état à l'écran, l'enregistre, et **revient en arrière** si
   * l'enregistrement échoue.
   *
   * L'affichage précédait l'écriture sans jamais la vérifier, ce qui est exactement
   * l'inverse de ce qu'une feuille de match peut se permettre. Un `saveMatch` en échec
   * laissait l'écran afficher un panier que la base n'avait pas : le tableau
   * d'affichage disait 42, la base 40, et le point disparaissait au rechargement.
   * Pour un score officiel, un état qui mente est plus grave qu'une action refusée.
   *
   * L'optimisme reste, et il est justifié : à la table de marque, la saisie doit
   * répondre au doigt sans attendre le disque. Ce qui manquait, c'est le retour en
   * arrière quand la promesse n'est pas tenue.
   *
   * Renvoie l'issue, car « Terminer » navigue hors de la rencontre juste après :
   * partir en croyant le match clos alors que rien n'a été écrit, c'est la même
   * tromperie un cran plus loin.
   */
  const persister = useCallback(async (next: Match, precedent: Match): Promise<boolean> => {
    apply(next); setError(null)
    try {
      await saveMatch(next)
      return true
    } catch {
      apply(precedent)
      setError('Enregistrement impossible sur cet appareil. L’action n’a pas été retenue — réessayez.')
      return false
    }
  }, [])

  useEffect(() => {
    getMatch(matchId).then((m) => { matchRef.current = m ?? null; setMatch(m ?? null) })
  }, [matchId])

  const dispatch = useCallback(async (input: EventInput) => {
    const current = matchRef.current
    if (!current) return
    const event = { ...input, id: newId(), wallClock: Date.now() } as GameEvent
    /* Deux causes d'échec, deux traitements. `appendEvent` ne lance que des messages
       intentionnels du règlement (« Impossible de marquer avant le démarrage du
       chrono. ») : ils s'affichent tels quels, et rien n'a encore été appliqué. Une
       panne d'écriture est autre chose, et tombait jusqu'ici dans le même `catch` —
       elle y montrait une exception technique brute à un bénévole. */
    let next: Match
    try {
      next = appendEvent(current, event)
    } catch (e) {
      // Le domaine renvoie une clef de règle, pas une phrase : voir `validateEvent`.
      setError(trad((e as Error).message))
      return
    }
    await persister(next, current)
  }, [persister, trad])

  /** Enchaîne plusieurs évènements en un seul état/sauvegarde atomique — évite qu'un
   * second dispatch synchrone n'écrase le premier en repartant d'un match périmé. */
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
      setError(trad((e as Error).message))
      return
    }
    await persister(next, current)
  }, [persister, trad])

  const undo = useCallback(async () => {
    const current = matchRef.current
    if (!current) return
    await persister(undoLast(current), current)
  }, [persister])

  /** Correction ciblée : retire le dernier évènement satisfaisant le prédicat. */
  const removeLast = useCallback(async (predicate: (e: GameEvent) => boolean) => {
    const current = matchRef.current
    if (!current) return
    const next = removeLastEvent(current, predicate)
    if (next === current) return
    await persister(next, current)
  }, [persister])

  /** Clôture définitivement le match (spec §8) : passe le statut à 'finished' et
   *  persiste. Renvoie `false` si l'écriture a échoué — l'appelant ne doit alors pas
   *  quitter la rencontre, elle n'est pas terminée. */
  const finish = useCallback(async (): Promise<boolean> => {
    const current = matchRef.current
    if (!current) return false
    return persister({ ...current, status: 'finished' }, current)
  }, [persister])

  return { match, dispatch, dispatchMany, undo, removeLast, finish, error }
}
