import { liveState } from '../rules/ffbb'
import { playerStats } from './boxscore'
import type { Match } from './types'

export interface TeamRecord {
  played: number; wins: number; losses: number
  pointsFor: number; pointsAgainst: number
  avgFor: number; avgAgainst: number
}

/**
 * A team's record over finished games (W/L, points for and against).
 *
 * Our club is always side A of the events (by construction of the model), so `sideOf`
 * no longer needs to exist as a separate function. There remain two ways of reading a
 * game, depending on whose record is asked for:
 * - `teamId` is our club (`meta.clubId`): the game counts towards us, read from side A.
 * - `teamId` is an opponent (`meta.opponentId`): we only ever hold our own meetings
 *   with them, read from side B — this is a record "against us", not their overall
 *   record for the season.
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

/** A team's games, most recent first (any status). */
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

/** Points per player for our club (games played or finished). An opponent has no
 *  roster entered, so its total is always empty. */
export function teamScorers(teamId: string, matches: Match[]): Map<string, number> {
  const agg = new Map<string, number>()
  for (const m of matches) {
    if (m.status === 'setup') continue
    if (m.meta.clubId !== teamId) continue
    for (const s of playerStats(m)) if (s.points > 0) agg.set(s.playerId, (agg.get(s.playerId) ?? 0) + s.points)
  }
  return agg
}
