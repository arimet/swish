/**
 * Ce qu'un ménage de fin de saison peut viser, déduit des rencontres existantes :
 * il n'y a ni table de championnat ni table de saison, exactement comme il n'y a
 * pas de table de dossiers pour les schémas (cf. `dossiers`). Un championnat vidé
 * de ses rencontres disparaît donc de lui-même, sans rien à ranger derrière.
 *
 * Ces fonctions servent des deux côtés : à compter ce qu'une opération va détruire
 * avant de l'annoncer, et à le détruire. Une opération irréversible ne doit pas
 * annoncer un chiffre calculé autrement que par ce qu'elle supprimera.
 */
import { champLabel } from './ids'
import type { Match } from './types'

/** Les championnats déclarés par ces rencontres, triés à la française. */
export const championnats = (matches: Match[]): string[] =>
  [...new Set(matches.map((m) => champLabel(m.meta)))].sort((a, b) => a.localeCompare(b, 'fr'))

/** Les années civiles déclarées par ces rencontres, de la plus récente à la plus
 *  ancienne. Le modèle ne connaît pas la saison sportive (août–juin) : rien dans
 *  les données ne porte ce découpage, l'année civile est ce qu'on peut offrir
 *  honnêtement. Une rencontre sans date n'appartient à aucune année, et aucun
 *  ménage par année ne l'emporte donc jamais. */
export const annees = (matches: Match[]): string[] =>
  [...new Set(matches.map((m) => m.meta.date?.slice(0, 4)).filter((a): a is string => !!a))].sort().reverse()

/** Les clubs dont ces rencontres sont les rencontres. Sert à proposer un vidage de
 *  feuilles par équipe : l'adversaire n'a jamais de feuille, il n'en est pas. */
export const clubsDesRencontres = (matches: Match[]): string[] =>
  [...new Set(matches.map((m) => m.meta.clubId))]

export const duChampionnat = (label: string) => (m: Match): boolean => champLabel(m.meta) === label
export const deLAnnee = (annee: string) => (m: Match): boolean => m.meta.date?.slice(0, 4) === annee

/** Les feuilles à vider pour ce club : ses rencontres qui portent au moins un
 *  évènement. Une rencontre encore vierge n'a rien à perdre — la compter ferait
 *  annoncer une destruction qui n'aurait pas lieu. */
export const aVider = (clubId: string) => (m: Match): boolean => m.meta.clubId === clubId && m.events.length > 0
