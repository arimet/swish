import type { Match, Period } from './types'

export function newId(): string {
  return crypto.randomUUID()
}
export function periodLength(period: Period): number {
  return period <= 4 ? 600 : 300
}
export function elapsedGlobal(period: Period, gameClock: number): number {
  let before = 0
  for (let p = 1; p < period; p++) before += periodLength(p)
  return before + (periodLength(period) - gameClock)
}
/** Chrono restant à reprendre pour la période courante : celui du dernier évènement
 *  de cette période dans le journal, ou la durée pleine si la période vient de commencer. */
export function seedSeconds(match: Match, period: Period): number {
  for (let i = match.events.length - 1; i >= 0; i--)
    if (match.events[i].period === period) return match.events[i].gameClock
  return periodLength(period)
}
