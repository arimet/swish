import type { Match, Training } from './types'

/** Une échéance de l'équipe : une rencontre à jouer, ou un entraînement. */
export type Fixture =
  | { kind: 'match'; id: string; date: string; match: Match }
  | { kind: 'training'; id: string; date: string; training: Training }

/**
 * Prochaine échéance à venir, rencontres et entraînements confondus.
 * `null` quand rien n'est prévu.
 *
 * La comparaison se fait sur la date seule, au format ISO : une échéance du jour
 * compte encore, car le matin d'un match on veut voir le match du jour et non celui
 * de la semaine suivante.
 */
export function nextFixture(matches: Match[], trainings: Training[], today: Date): Fixture | null {
  const jour = today.toISOString().slice(0, 10)
  const echeances: Fixture[] = []
  for (const m of matches) {
    // Une rencontre terminée n'est plus une échéance ; une rencontre sans date
    // n'est pas planifiée et ne peut pas être annoncée comme prochaine.
    if (m.status === 'finished' || !m.meta.date) continue
    if (m.meta.date >= jour) echeances.push({ kind: 'match', id: m.id, date: m.meta.date, match: m })
  }
  for (const t of trainings) {
    if (t.date >= jour) echeances.push({ kind: 'training', id: t.id, date: t.date, training: t })
  }
  // À égalité de date, la rencontre passe avant : c'est elle qui compte.
  echeances.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'match' ? -1 : 1))
  return echeances[0] ?? null
}
