import type { Match, MatchMeta, Period } from './types'

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
/** The clock to resume for the current period: the one on the last event of that
 *  period in the log, or the full length if the period has just started. */
export function seedSeconds(match: Match, period: Period): number {
  for (let i = match.events.length - 1; i >= 0; i--)
    if (match.events[i].period === period) return match.events[i].gameClock
  return periodLength(period)
}
/** The league label used when a game carries none.
 *
 * This is a **data value**, not a screen label: it is the grouping key for cleanup,
 * standings and head-to-heads, and it ends up stored in hand-entered results.
 * Translating it here would split one league in two depending on who entered it.
 * Display swaps it at the last moment, through `useLeagueLabel` (see `ui/olive/kit`). */
export const FRIENDLY = 'Match amical'
export const leagueLabel = (meta: MatchMeta) => meta.championshipLabel?.trim() || FRIENDLY
