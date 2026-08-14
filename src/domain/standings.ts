import { liveState } from '../rules/ffbb'
import { champLabel } from './ids'
import type { Match, ReportedResult, Team } from './types'

export interface StandingLine {
  id: string; name: string
  j: number; v: number; d: number
  pf: number; pa: number; pts: number
}

/** Clé d'une confrontation, insensible au sens domicile/extérieur : deux saisies du
 *  même match dans l'ordre inverse doivent se reconnaître. Exportée pour que l'écran
 *  de saisie (Championnat.tsx) détecte les doublons avec la même définition — une
 *  clé dupliquée ailleurs divergerait un jour en silence. */
export const clefConfrontation = (champ: string, x: string, y: string, date?: string) =>
  `${champ}|${[x, y].sort().join('~')}|${date ?? ''}`

/**
 * Classement FFBB simplifié : victoire = 2 pts, défaite = 1 pt.
 * Combine nos rencontres terminées et les résultats saisis à la main.
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
  const compte = (champ: string, xId: string, yId: string, xs: number, ys: number) => {
    const X = ensure(champ, xId)
    const Y = ensure(champ, yId)
    X.j++; Y.j++; X.pf += xs; X.pa += ys; Y.pf += ys; Y.pa += xs
    if (xs >= ys) { X.v++; X.pts += 2; Y.d++; Y.pts += 1 } else { Y.v++; Y.pts += 2; X.d++; X.pts += 1 }
  }

  const nôtres = new Set<string>()
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const champ = champLabel(m.meta)
    const { score } = liveState(m)
    nôtres.add(clefConfrontation(champ, m.meta.clubId, m.meta.opponentId, m.meta.date))
    compte(champ, m.meta.clubId, m.meta.opponentId, score.a, score.b)
  }
  for (const r of results) {
    // Une de nos rencontres fait foi : elle est saisie action par action, le résultat
    // recopié ne l'est pas. Sans ce garde, une saisie par distraction compterait deux fois.
    if (nôtres.has(clefConfrontation(r.championshipLabel, r.homeId, r.awayId, r.date))) continue
    compte(r.championshipLabel, r.homeId, r.awayId, r.homeScore, r.awayScore)
  }

  return [...byChamp.entries()].map(([champ, m]) => ({
    champ,
    lines: [...m.values()].sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa)),
  }))
}
