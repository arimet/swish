import type { Match, Training } from './types'

/** Something on the team's horizon: a game to play, or a training session. */
export type Fixture =
  | { kind: 'match'; id: string; date: string; match: Match }
  | { kind: 'training'; id: string; date: string; training: Training }

/**
 * Le jour d'une date, au format ISO, lu sur l'horloge locale.
 *
 * `toISOString()` converts to UTC: between midnight and the local offset (0:00–2:00
 * in France, say), it still returns the previous day. So the day is derived from the
 * local components, not from the UTC representation.
 */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Ages in words, in the app's language rather than the browser's: a French club reads
 *  "il y a 3 semaines" on an English machine, the same way the calendar writes its own
 *  months. `numeric: 'always'` rather than `'auto'`: "2 days ago" compares at a glance
 *  with "3 weeks ago", where "the day before yesterday" needs converting. */
const relatif = (lang: string) => new Intl.RelativeTimeFormat(lang, { numeric: 'always' })

/**
 * A date's age, in words: "2 days ago" does not weigh the same as "3 weeks ago", and a
 * message forgotten for a month should read as such.
 *
 * Returns `null` below a minute, leaving the caller to write "just now": `Intl` can only
 * format a gap, and "in 0 minutes" is not a sentence. The same goes for a future date —
 * the device clock moved back since writing — folded in here, because "in two hours"
 * makes no sense under a text already written.
 */
export function since(iso: string, lang = 'fr', maintenant = new Date()): string | null {
  const sec = Math.max(0, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 1000))
  const [n, unité]: [number, Intl.RelativeTimeFormatUnit] =
    sec < 3600 ? [Math.floor(sec / 60), 'minute']
    : sec < 86400 ? [Math.floor(sec / 3600), 'hour']
    : sec < 7 * 86400 ? [Math.floor(sec / 86400), 'day']
    : sec < 30 * 86400 ? [Math.floor(sec / (7 * 86400)), 'week']
    : [Math.floor(sec / (30 * 86400)), 'month']
  return n < 1 ? null : relatif(lang).format(-n, unité)
}

/**
 * The next thing coming up, games and trainings together. `null` when nothing is
 * planned.
 *
 * The comparison runs on the date alone, in ISO form: today still counts, because on
 * the morning of a game you want to see that game and not next week's.
 */
export function nextFixture(matches: Match[], trainings: Training[], today: Date): Fixture | null {
  const jour = isoDay(today)
  const echeances: Fixture[] = []
  // Trainings are added before games: the sort below is stable, so if insertion order
  // decided ties on date, it would have to coincide with the intended rule by accident.
  // Inserting them the "wrong" way round makes the explicit tie-break decide, rather
  // than an accidental insertion order.
  for (const t of trainings) {
    if (t.date >= jour) echeances.push({ kind: 'training', id: t.id, date: t.date, training: t })
  }
  for (const m of matches) {
    // A finished game is no longer upcoming; a game with no date is not scheduled and
    // cannot be announced as next.
    if (m.status === 'finished' || !m.meta.date) continue
    if (m.meta.date >= jour) echeances.push({ kind: 'match', id: m.id, date: m.meta.date, match: m })
  }
  // On an equal date the game comes first: it is the one that counts. Between two
  // items of the same kind nothing separates them: returning 0 (rather than -1 on both
  // sides) avoids an inconsistent comparator — a sort() malformed that way has an
  // undefined result that can vary between engines or versions.
  echeances.sort((a, b) =>
    a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'match' ? -1 : 1))
  return echeances[0] ?? null
}
