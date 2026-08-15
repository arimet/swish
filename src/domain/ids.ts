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
/** Chrono restant à reprendre pour la période courante : celui du dernier évènement
 *  de cette période dans le journal, ou la durée pleine si la période vient de commencer. */
export function seedSeconds(match: Match, period: Period): number {
  for (let i = match.events.length - 1; i >= 0; i--)
    if (match.events[i].period === period) return match.events[i].gameClock
  return periodLength(period)
}
/** Libellé de championnat avec repli quand la rencontre n'en a pas. */
/** Le libellé du championnat quand la rencontre n'en porte aucun.
 *
 * C'est une **valeur de données**, pas un libellé d'écran : elle sert de clef de
 * regroupement au ménage, au classement et aux confrontations, et elle finit stockée
 * dans les résultats saisis à la main. La traduire ici scinderait un même championnat
 * en deux selon la langue de qui l'a saisi. L'affichage la remplace au dernier moment,
 * par `useChampLabel` (voir `ui/olive/kit`). */
export const AMICAL = 'Match amical'
export const champLabel = (meta: MatchMeta) => meta.championshipLabel?.trim() || AMICAL
