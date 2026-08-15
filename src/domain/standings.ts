import { liveState } from '../rules/ffbb'
import { leagueLabel } from './ids'
import type { Match, ReportedResult, Team } from './types'

export interface StandingLine {
  id: string; name: string
  played: number; wins: number; losses: number
  pointsFor: number; pointsAgainst: number; pts: number
}

/** A head-to-head key, blind to home/away order: two entries of the same game the
 *  other way round must recognise each other. Exported so the entry screen
 *  (Standings.tsx) detects duplicates with the same definition — a key duplicated
 *  elsewhere would drift apart one day, in silence. */
export const fixtureKey = (league: string, x: string, y: string, date?: string) =>
  `${league}|${[x, y].sort().join('~')}|${date ?? ''}`

/**
 * Simplified FFBB standings: a win is 2 points, a loss 1.
 * Combines our finished games with hand-entered results.
 */
export function standings(
  matches: Match[], results: ReportedResult[], teams: Record<string, Team>,
): { league: string; lines: StandingLine[] }[] {
  const byLeague = new Map<string, Map<string, StandingLine>>()
  const ensure = (league: string, id: string) => {
    if (!byLeague.has(league)) byLeague.set(league, new Map())
    const m = byLeague.get(league)!
    if (!m.has(id)) m.set(id, { id, name: teams[id]?.name ?? id, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pts: 0 })
    return m.get(id)!
  }
  const count = (league: string, xId: string, yId: string, xs: number, ys: number) => {
    const X = ensure(league, xId)
    const Y = ensure(league, yId)
    X.played++; Y.played++; X.pointsFor += xs; X.pointsAgainst += ys; Y.pointsFor += ys; Y.pointsAgainst += xs
    if (xs >= ys) { X.wins++; X.pts += 2; Y.losses++; Y.pts += 1 } else { Y.wins++; Y.pts += 2; X.losses++; X.pts += 1 }
  }

  const ours = new Set<string>()
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const league = leagueLabel(m.meta)
    const { score } = liveState(m)
    ours.add(fixtureKey(league, m.meta.clubId, m.meta.opponentId, m.meta.date))
    count(league, m.meta.clubId, m.meta.opponentId, score.a, score.b)
  }
  for (const r of results) {
    // One of our own games is authoritative: it is entered action by action, a copied
    // result is not. Without this guard, an absent-minded entry would count twice.
    if (ours.has(fixtureKey(r.championshipLabel, r.homeId, r.awayId, r.date))) continue
    count(r.championshipLabel, r.homeId, r.awayId, r.homeScore, r.awayScore)
  }

  return [...byLeague.entries()].map(([league, m]) => ({
    league,
    lines: [...m.values()].sort((x, y) => y.pts - x.pts || (y.pointsFor - y.pointsAgainst) - (x.pointsFor - x.pointsAgainst)),
  }))
}
