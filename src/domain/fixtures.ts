import type { Match, Training } from './types'

/** Une échéance de l'équipe : une rencontre à jouer, ou un entraînement. */
export type Fixture =
  | { kind: 'match'; id: string; date: string; match: Match }
  | { kind: 'training'; id: string; date: string; training: Training }

/**
 * Le jour d'une date, au format ISO, lu sur l'horloge locale.
 *
 * `toISOString()` convertit en UTC : entre minuit et l'heure du décalage local
 * (ex. 0h-2h en France), elle renvoie encore la veille. On dérive donc le jour
 * des composantes locales, pas de la représentation UTC.
 */
export const jourISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Les âges en toutes lettres, dans la langue de l'application et non dans celle du
 *  navigateur : un club français lit « il y a 3 semaines » sur une machine en anglais,
 *  comme le calendrier écrit ses mois lui-même. `numeric: 'always'` plutôt que `'auto'` :
 *  « il y a 2 jours » se compare d'un coup d'œil à « il y a 3 semaines », là où
 *  « avant-hier » demande de convertir. */
const relatif = (langue: string) => new Intl.RelativeTimeFormat(langue, { numeric: 'always' })

/**
 * L'âge d'une date, en toutes lettres : « il y a 2 jours » n'a pas le même poids
 * que « il y a 3 semaines », et un message oublié depuis un mois doit se lire
 * comme tel.
 *
 * Renvoie `null` en deçà d'une minute, à charge pour l'appelant d'écrire « à l'instant » :
 * `Intl` ne sait formater qu'un écart, et « dans 0 minute » n'est pas une phrase. C'est
 * aussi le cas d'une date à venir — horloge de l'appareil reculée depuis l'écriture —
 * ramenée là, car « dans deux heures » n'a aucun sens sous un texte déjà écrit.
 */
export function depuis(iso: string, langue = 'fr', maintenant = new Date()): string | null {
  const sec = Math.max(0, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 1000))
  const [n, unité]: [number, Intl.RelativeTimeFormatUnit] =
    sec < 3600 ? [Math.floor(sec / 60), 'minute']
    : sec < 86400 ? [Math.floor(sec / 3600), 'hour']
    : sec < 7 * 86400 ? [Math.floor(sec / 86400), 'day']
    : sec < 30 * 86400 ? [Math.floor(sec / (7 * 86400)), 'week']
    : [Math.floor(sec / (30 * 86400)), 'month']
  return n < 1 ? null : relatif(langue).format(-n, unité)
}

/**
 * Prochaine échéance à venir, rencontres et entraînements confondus.
 * `null` quand rien n'est prévu.
 *
 * La comparaison se fait sur la date seule, au format ISO : une échéance du jour
 * compte encore, car le matin d'un match on veut voir le match du jour et non celui
 * de la semaine suivante.
 */
export function nextFixture(matches: Match[], trainings: Training[], today: Date): Fixture | null {
  const jour = jourISO(today)
  const echeances: Fixture[] = []
  // Les entraînements sont ajoutés avant les rencontres : le tri ci-dessous est stable,
  // donc si l'ordre d'insertion décidait des égalités de date, il faudrait qu'il coïncide
  // par hasard avec la règle voulue. En les mettant dans l'ordre « inverse », c'est bien
  // le départage explicite qui décide, et non un ordre d'insertion accidentel.
  for (const t of trainings) {
    if (t.date >= jour) echeances.push({ kind: 'training', id: t.id, date: t.date, training: t })
  }
  for (const m of matches) {
    // Une rencontre terminée n'est plus une échéance ; une rencontre sans date
    // n'est pas planifiée et ne peut pas être annoncée comme prochaine.
    if (m.status === 'finished' || !m.meta.date) continue
    if (m.meta.date >= jour) echeances.push({ kind: 'match', id: m.id, date: m.meta.date, match: m })
  }
  // À égalité de date, la rencontre passe avant : c'est elle qui compte. Entre deux
  // échéances de même nature, rien ne les départage : renvoyer 0 (et non -1 des deux
  // côtés) évite un comparateur incohérent — un sort() ainsi mal formé a un résultat
  // indéfini, qui peut varier d'un moteur ou d'une version à l'autre.
  echeances.sort((a, b) =>
    a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'match' ? -1 : 1))
  return echeances[0] ?? null
}
