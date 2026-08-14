import { liveState } from '../rules/ffbb'
import { playerStats } from './boxscore'
import type { Match } from './types'

export interface TeamRecord {
  played: number; wins: number; losses: number
  pointsFor: number; pointsAgainst: number
  avgFor: number; avgAgainst: number
}

/**
 * Bilan d'une équipe sur les rencontres terminées (V/D, points pour/contre).
 *
 * Notre club est toujours le côté A des évènements (construction du modèle) :
 * `sideOf` n'a donc plus lieu d'être en tant que fonction à part. Il reste
 * cependant deux façons de lire une rencontre selon l'identité demandée :
 * - `teamId` est notre club (`meta.clubId`) : la rencontre compte à notre
 *   compte, lue côté A.
 * - `teamId` est un adversaire (`meta.opponentId`) : on n'a jamais que nos
 *   confrontations avec lui, lues côté B — c'est un bilan « contre nous »,
 *   pas son bilan général sur sa saison.
 */
export function teamRecord(teamId: string, matches: Match[]): TeamRecord {
  let played = 0, wins = 0, losses = 0, pf = 0, pa = 0
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const asClub = m.meta.clubId === teamId
    if (!asClub && m.meta.opponentId !== teamId) continue
    const { score } = liveState(m)
    const mine = asClub ? score.a : score.b
    const opp = asClub ? score.b : score.a
    played++; pf += mine; pa += opp
    if (mine >= opp) wins++; else losses++
  }
  return {
    played, wins, losses, pointsFor: pf, pointsAgainst: pa,
    avgFor: played ? Math.round(pf / played) : 0,
    avgAgainst: played ? Math.round(pa / played) : 0,
  }
}

export interface TeamMatchLine {
  match: Match; opponentId: string
  scored: number | null; conceded: number | null; result: 'V' | 'D' | null
}

/** Rencontres d'une équipe, la plus récente d'abord (tous statuts). */
export function teamMatches(teamId: string, matches: Match[]): TeamMatchLine[] {
  return matches
    .map((m): TeamMatchLine | null => {
      const asClub = m.meta.clubId === teamId
      if (!asClub && m.meta.opponentId !== teamId) return null
      const opponentId = asClub ? m.meta.opponentId : m.meta.clubId
      if (m.status === 'setup') return { match: m, opponentId, scored: null, conceded: null, result: null }
      const { score } = liveState(m)
      const scored = asClub ? score.a : score.b
      const conceded = asClub ? score.b : score.a
      const result: 'V' | 'D' | null = m.status === 'finished' ? (scored >= conceded ? 'V' : 'D') : null
      return { match: m, opponentId, scored, conceded, result }
    })
    .filter((x): x is TeamMatchLine => x !== null)
    .sort((a, b) => (b.match.meta.date ?? '').localeCompare(a.match.meta.date ?? ''))
}

/** Cumul de points par joueur pour notre club (rencontres jouées ou terminées).
 *  Un adversaire n'a pas d'effectif saisi : son cumul est toujours vide. */
export function teamScorers(teamId: string, matches: Match[]): Map<string, number> {
  const agg = new Map<string, number>()
  for (const m of matches) {
    if (m.status === 'setup') continue
    if (m.meta.clubId !== teamId) continue
    for (const s of playerStats(m)) if (s.points > 0) agg.set(s.playerId, (agg.get(s.playerId) ?? 0) + s.points)
  }
  return agg
}
