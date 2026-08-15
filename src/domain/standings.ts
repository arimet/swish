import { liveState } from '../rules/ffbb'
import { leagueLabel } from './ids'
import type { Match, ReportedResult, Team } from './types'

export interface StandingLine {
  id: string; name: string
  j: number; v: number; d: number
  pf: number; pa: number; pts: number
}

/** A head-to-head key, blind to home/away order: two entries of the same game the
 *  other way round must recognise each other. Exported so the entry screen
 *  (Championnat.tsx) detects duplicates with the same definition — a key duplicated
 *  elsewhere would drift apart one day, in silence. */
export const fixtureKey = (champ: string, x: string, y: string, date?: string) =>
  `${champ}|${[x, y].sort().join('~')}|${date ?? ''}`

/**
 * Simplified FFBB standings: a win is 2 points, a loss 1.
 * Combines our finished games with hand-entered results.
 */
export function standings(
  matches: Match[], results: ReportedResult[], teams: Record<string, Team>,
): { champ: string; lines: StandingLine[] }[] {
  const byChamp = new Map<string, Map<string, StandingLine>>()
  const ensure = (champ: string, id: string) => {
    if (!byChamp.has(champ)) byChamp.set(champ, new Map())
    const m = byChamp.get(champ)!
    if (!m.has(id)) m.set(id, { id, name: teams[id]?.name ?? id, j: 0, v: 0, d: 0, pf: 0, pa: 0, pts: 0 })
    return m.get(id)!
  }
  const count = (champ: string, xId: string, yId: string, xs: number, ys: number) => {
    const X = ensure(champ, xId)
    const Y = ensure(champ, yId)
    X.j++; Y.j++; X.pf += xs; X.pa += ys; Y.pf += ys; Y.pa += xs
    if (xs >= ys) { X.v++; X.pts += 2; Y.d++; Y.pts += 1 } else { Y.v++; Y.pts += 2; X.d++; X.pts += 1 }
  }

  const nôtres = new Set<string>()
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const champ = leagueLabel(m.meta)
    const { score } = liveState(m)
    nôtres.add(fixtureKey(champ, m.meta.clubId, m.meta.opponentId, m.meta.date))
    count(champ, m.meta.clubId, m.meta.opponentId, score.a, score.b)
  }
  for (const r of results) {
    // One of our own games is authoritative: it is entered action by action, a copied
    // result is not. Without this guard, an absent-minded entry would count twice.
    if (nôtres.has(fixtureKey(r.championshipLabel, r.homeId, r.awayId, r.date))) continue
    count(r.championshipLabel, r.homeId, r.awayId, r.homeScore, r.awayScore)
  }

  return [...byChamp.entries()].map(([champ, m]) => ({
    champ,
    lines: [...m.values()].sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa)),
  }))
}
