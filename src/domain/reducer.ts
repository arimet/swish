import type { GameEvent, Match } from './types'

/** Is the clock running right now? */
function clockRunning(events: GameEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i].type
    if (t === 'CLOCK_START') return true
    if (t === 'CLOCK_STOP' || t === 'PERIOD_END' || t === 'PERIOD_START') return false
  }
  return false
}

/** Has the clock started at least once in the current period? */
function clockStartedThisPeriod(events: GameEvent[], period: number): boolean {
  return events.some((e) => e.period === period && e.type === 'CLOCK_START')
}

/**
 * The rule that was broken, as a **translation key** — or `null` if the event passes.
 *
 * These messages used to be hard-coded French, and they surface in the scorer's table
 * error banner, so they stayed French inside an English interface. The domain cannot
 * translate them itself — it is pure code, called outside React, with no knowledge of
 * the current language. It names the rule; the interface says it.
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

/** Takes the event out of the log and keeps its id as a retraction. See
 *  `Match.retracted` for why both are needed. */
function strike(match: Match, id: string, events: GameEvent[]): Match {
  return { ...match, events, retracted: [...(match.retracted ?? []), id] }
}

/** Removes the last event matching the predicate (correcting a mis-entry: a basket,
 * foul or timeout logged by mistake). No-op when none matches. Selectors replay the
 * log, so points, fouls and timeouts recompute themselves. */
export function removeLastEvent(match: Match, predicate: (e: GameEvent) => boolean): Match {
  for (let i = match.events.length - 1; i >= 0; i--) {
    if (predicate(match.events[i]))
      return strike(match, match.events[i].id, [...match.events.slice(0, i), ...match.events.slice(i + 1)])
  }
  return match
}
