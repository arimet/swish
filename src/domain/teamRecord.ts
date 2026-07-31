import { liveState } from '../rules/ffbb'
import { playerStats } from './boxscore'
import type { Match, TeamSide } from './types'

export interface TeamRecord {
  played: number; wins: number; losses: number
  pointsFor: number; pointsAgainst: number
  avgFor: number; avgAgainst: number
}

const sideOf = (m: Match, teamId: string): TeamSide | null =>
  m.meta.teamAId === teamId ? 'A' : m.meta.teamBId === teamId ? 'B' : null

/** Bilan d'une équipe sur les rencontres terminées (V/D, points pour/contre). */
export function teamRecord(teamId: string, matches: Match[]): TeamRecord {
  let played = 0, wins = 0, losses = 0, pf = 0, pa = 0
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const side = sideOf(m, teamId)
    if (!side) continue
    const { score } = liveState(m)
    const mine = side === 'A' ? score.a : score.b
    const opp = side === 'A' ? score.b : score.a
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
  match: Match; side: TeamSide; opponentId: string
  scored: number | null; conceded: number | null; result: 'V' | 'D' | null
}

/** Rencontres d'une équipe, la plus récente d'abord (tous statuts). */
export function teamMatches(teamId: string, matches: Match[]): TeamMatchLine[] {
  return matches
    .map((m): TeamMatchLine | null => {
      const side = sideOf(m, teamId)
      if (!side) return null
      const opponentId = side === 'A' ? m.meta.teamBId : m.meta.teamAId
      if (m.status === 'setup') return { match: m, side, opponentId, scored: null, conceded: null, result: null }
      const { score } = liveState(m)
      const scored = side === 'A' ? score.a : score.b
      const conceded = side === 'A' ? score.b : score.a
      const result: 'V' | 'D' | null = m.status === 'finished' ? (scored >= conceded ? 'V' : 'D') : null
      return { match: m, side, opponentId, scored, conceded, result }
    })
    .filter((x): x is TeamMatchLine => x !== null)
    .sort((a, b) => (b.match.meta.date ?? '').localeCompare(a.match.meta.date ?? ''))
}

/** Cumul de points par joueur pour une équipe (rencontres jouées ou terminées). */
export function teamScorers(teamId: string, matches: Match[]): Map<string, number> {
  const agg = new Map<string, number>()
  for (const m of matches) {
    if (m.status === 'setup') continue
    const side = sideOf(m, teamId)
    if (!side) continue
    for (const s of playerStats(m, side)) if (s.points > 0) agg.set(s.playerId, (agg.get(s.playerId) ?? 0) + s.points)
  }
  return agg
}
