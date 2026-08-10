import { liveState } from '../rules/ffbb'
import { champLabel } from './ids'
import type { Match, Team } from './types'

export interface StandingLine {
  id: string; name: string
  j: number; v: number; d: number
  pf: number; pa: number; pts: number
}

/** Classement FFBB simplifié : victoire = 2 pts, défaite = 1 pt (matchs terminés). */
export function standings(matches: Match[], teams: Record<string, Team>): { champ: string; lines: StandingLine[] }[] {
  const byChamp = new Map<string, Map<string, StandingLine>>()
  const ensure = (champ: string, id: string) => {
    if (!byChamp.has(champ)) byChamp.set(champ, new Map())
    const m = byChamp.get(champ)!
    if (!m.has(id)) m.set(id, { id, name: teams[id]?.name ?? id, j: 0, v: 0, d: 0, pf: 0, pa: 0, pts: 0 })
    return m.get(id)!
  }
  for (const match of matches) {
    if (match.status !== 'finished') continue
    const { score } = liveState(match)
    const A = ensure(champLabel(match.meta), match.meta.teamAId)
    const B = ensure(champLabel(match.meta), match.meta.teamBId)
    A.j++; B.j++; A.pf += score.a; A.pa += score.b; B.pf += score.b; B.pa += score.a
    if (score.a >= score.b) { A.v++; A.pts += 2; B.d++; B.pts += 1 } else { B.v++; B.pts += 2; A.d++; A.pts += 1 }
  }
  return [...byChamp.entries()].map(([champ, m]) => ({
    champ,
    lines: [...m.values()].sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa)),
  }))
}

/** Place du club dans son championnat. `null` s'il n'apparaît dans aucune rencontre
 *  terminée — auquel cas afficher un rang serait inventer une information. */
export function clubStanding(
  matches: Match[], teams: Record<string, Team>, clubId: string,
): { champ: string; rank: number; total: number; line: StandingLine } | null {
  for (const { champ, lines } of standings(matches, teams)) {
    const i = lines.findIndex((l) => l.id === clubId)
    if (i >= 0) return { champ, rank: i + 1, total: lines.length, line: lines[i] }
  }
  return null
}
