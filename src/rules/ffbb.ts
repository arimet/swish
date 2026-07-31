import { pointsForKind } from '../domain/boxscore'
import type { Match, Period, TeamSide } from '../domain/types'

export const PERIOD_COUNT = 4
export const TEAM_FOUL_BONUS = 5
export const PLAYER_FOUL_OUT = 5

/** Total de temps-morts autorisés cumulés jusqu'à la fin de `period`. */
export function timeoutsAllowed(period: Period): number {
  let total = 2 // 1ère mi-temps (périodes 1-2)
  if (period >= 3) total += 3 // 2ème mi-temps (périodes 3-4)
  if (period >= 5) total += period - 4 // +1 par prolongation
  return total
}

export interface LiveState {
  period: Period
  clockRunning: boolean
  score: { a: number; b: number }
  teamFoulsThisPeriod: { A: number; B: number }
  bonus: { A: boolean; B: boolean }
  timeoutsUsed: { A: number; B: number }
  timeoutsRemaining: { A: number; B: number }
  onCourt: { A: string[]; B: string[] }
  fouledOut: { A: string[]; B: string[] }
}

export function liveState(match: Match): LiveState {
  let period: Period = 1
  let clockRunning = false
  const score = { a: 0, b: 0 }
  const teamFouls = { A: 0, B: 0 }
  const timeoutsUsed = { A: 0, B: 0 }
  // Cinq sur le terrain, dans l'ordre d'affichage : un remplaçant prend la place
  // exacte du joueur sortant (on remplace en place, sans réordonner).
  const onCourt: { A: string[]; B: string[] } = { A: [], B: [] }
  const playerFouls = new Map<string, number>()

  for (const e of match.events) {
    switch (e.type) {
      case 'PERIOD_START':
        period = e.period; teamFouls.A = 0; teamFouls.B = 0; clockRunning = false
        break
      case 'PERIOD_END': clockRunning = false; break
      case 'CLOCK_START': clockRunning = true; break
      case 'CLOCK_STOP': clockRunning = false; break
      case 'STARTING_FIVE': onCourt[e.team] = [...e.playerIds]; break
      case 'SUBSTITUTION': {
        const arr = onCourt[e.team]
        const i = arr.indexOf(e.playerOutId)
        if (i >= 0) arr[i] = e.playerInId
        else if (!arr.includes(e.playerInId)) arr.push(e.playerInId)
        break
      }
      case 'SCORE':
        if (e.team === 'A') score.a += pointsForKind(e.kind); else score.b += pointsForKind(e.kind)
        break
      case 'TIMEOUT': timeoutsUsed[e.team]++; break
      case 'FOUL':
        teamFouls[e.team]++
        if (e.target.kind === 'player') {
          const n = (playerFouls.get(e.target.playerId) ?? 0) + 1
          playerFouls.set(e.target.playerId, n)
        }
        break
    }
  }

  const fouledOutOf = (side: TeamSide) =>
    match.roster[side].filter((id) => (playerFouls.get(id) ?? 0) >= PLAYER_FOUL_OUT)
  const allowed = timeoutsAllowed(period)

  return {
    period, clockRunning, score,
    teamFoulsThisPeriod: { A: teamFouls.A, B: teamFouls.B },
    bonus: { A: teamFouls.A >= TEAM_FOUL_BONUS, B: teamFouls.B >= TEAM_FOUL_BONUS },
    timeoutsUsed,
    timeoutsRemaining: { A: Math.max(0, allowed - timeoutsUsed.A), B: Math.max(0, allowed - timeoutsUsed.B) },
    onCourt: { A: [...onCourt.A], B: [...onCourt.B] },  // ordre d'affichage préservé
    fouledOut: { A: fouledOutOf('A'), B: fouledOutOf('B') },
  }
}
