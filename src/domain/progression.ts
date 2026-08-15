'use strict'

import { pointsForKind } from './boxscore'
import { elapsedGlobal } from './ids'
import type { Match } from './types'

export interface ProgressionPoint { t: number; a: number; b: number }
export interface Ratios { maxLead: number; maxRun: number; benchPoints: number; leadDurationSec: number }
export interface MatchRatios { A: Ratios; B: Ratios; ties: number }

export function scoreProgression(match: Match): ProgressionPoint[] {
  const pts: ProgressionPoint[] = [{ t: 0, a: 0, b: 0 }]
  let a = 0, b = 0
  for (const e of match.events) {
    if (e.type !== 'SCORE') continue
    const v = pointsForKind(e.kind)
    if (e.team === 'A') a += v; else b += v
    pts.push({ t: elapsedGlobal(e.period, e.gameClock), a, b })
  }
  return pts
}

export function matchRatios(match: Match): MatchRatios {
  const prog = scoreProgression(match)
  let maxLeadA = 0, maxLeadB = 0, ties = 0
  let runA = 0, runB = 0, maxRunA = 0, maxRunB = 0
  let leadDurA = 0, leadDurB = 0
  let prevLead = 0

  for (let i = 0; i < prog.length; i++) {
    const { a, b, t } = prog[i]
    const lead = a - b
    maxLeadA = Math.max(maxLeadA, lead)
    maxLeadB = Math.max(maxLeadB, -lead)
    if (i > 0 && a === b) ties++ // égalité après un panier (0-0 initial exclu)

    // longest run: consecutive points by one team
    if (i > 0) {
      const dA = a - prog[i - 1].a
      const dB = b - prog[i - 1].b
      if (dA > 0) { runA += dA; runB = 0 }
      if (dB > 0) { runB += dB; runA = 0 }
      maxRunA = Math.max(maxRunA, runA)
      maxRunB = Math.max(maxRunB, runB)

      // time in front: segment [t_{i-1}, t_i) credited to the team leading before this basket
      const dt = t - prog[i - 1].t
      if (prevLead > 0) leadDurA += dt
      else if (prevLead < 0) leadDurB += dt
    }
    prevLead = lead
  }

  return {
    A: { maxLead: maxLeadA, maxRun: maxRunA, benchPoints: 0, leadDurationSec: leadDurA },
    B: { maxLead: maxLeadB, maxRun: maxRunB, benchPoints: 0, leadDurationSec: leadDurB },
    ties,
  } // benchPoints rempli par teamTotals côté UI ; ratio brut ici
}
