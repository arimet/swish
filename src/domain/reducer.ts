import type { GameEvent, Match } from './types'

/** Est-ce que le chrono tourne actuellement ? */
function clockRunning(events: GameEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i].type
    if (t === 'CLOCK_START') return true
    if (t === 'CLOCK_STOP' || t === 'PERIOD_END' || t === 'PERIOD_START') return false
  }
  return false
}

/** Le chrono a-t-il déjà démarré au moins une fois sur la période courante ? */
function clockStartedThisPeriod(events: GameEvent[], period: number): boolean {
  return events.some((e) => e.period === period && e.type === 'CLOCK_START')
}

/**
 * La règle violée, sous forme de **clef de traduction** — ou `null` si l'évènement
 * passe.
 *
 * Ces messages étaient du français en dur, et ils remontent jusqu'au bandeau d'erreur
 * de la table de marque : ils restaient donc français dans une interface anglaise.
 * Le domaine ne peut pas les traduire lui-même — c'est du code pur, appelé hors de
 * React, qui ne connaît pas la langue courante. Il nomme la règle, l'interface la dit.
 */
export function validateEvent(match: Match, event: GameEvent): string | null {
  const { events } = match
  switch (event.type) {
    case 'CLOCK_START':
      if (clockRunning(events)) return 'regle.chronoDejaLance'
      return null
    case 'CLOCK_STOP':
      if (!clockRunning(events)) return 'regle.chronoDejaArrete'
      return null
    case 'SCORE':
    case 'MISS':
      if (!clockStartedThisPeriod(events, event.period))
        return 'regle.avantChrono'
      return null
    default:
      return null
  }
}

export function appendEvent(match: Match, event: GameEvent): Match {
  const error = validateEvent(match, event)
  if (error) throw new Error(error)
  return { ...match, events: [...match.events, event] }
}

export function undoLast(match: Match): Match {
  if (match.events.length === 0) return match
  return strike(match, match.events[match.events.length - 1].id, match.events.slice(0, -1))
}

/** Sort l'évènement du journal et garde son identifiant en rature. Voir
 *  `Match.retires` pour pourquoi les deux sont nécessaires. */
function strike(match: Match, id: string, events: GameEvent[]): Match {
  return { ...match, events, retracted: [...(match.retracted ?? []), id] }
}

/** Retire le dernier évènement satisfaisant le prédicat (correction d'une erreur
 * de saisie : panier, faute ou temps-mort entré par erreur). No-op si aucun ne
 * correspond. Les sélecteurs rejouent le journal → points/fautes/TM se recalculent. */
export function removeLastEvent(match: Match, predicate: (e: GameEvent) => boolean): Match {
  for (let i = match.events.length - 1; i >= 0; i--) {
    if (predicate(match.events[i]))
      return strike(match, match.events[i].id, [...match.events.slice(0, i), ...match.events.slice(i + 1)])
  }
  return match
}
