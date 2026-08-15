import type { Match, ScoreKind } from './types'

export interface PlayerStat {
  playerId: string
  points: number
  fieldGoalsMade: number
  threes: number
  twoInside: number
  twoOutside: number
  freeThrows: number
  fouls: number
  /** Missed field goals. Free throws have no position and do not count here. */
  misses: number
  assists: number
  offRebounds: number
  defRebounds: number
  blocks: number
  isStarter: boolean
}

export function pointsForKind(kind: ScoreKind): number {
  switch (kind) {
    case 'lf': return 1
    case '3': return 3
    default: return 2 // 2int, 2ext
  }
}

/** Our roster's stats (side A). No players are entered for the opponent. */
export function playerStats(match: Match): PlayerStat[] {
  const roster = match.roster
  const stats = new Map<string, PlayerStat>()
  for (const id of roster)
    stats.set(id, {
      playerId: id, points: 0, fieldGoalsMade: 0, threes: 0,
      twoInside: 0, twoOutside: 0, freeThrows: 0, fouls: 0, misses: 0,
      assists: 0, offRebounds: 0, defRebounds: 0, blocks: 0, isStarter: false,
    })

  for (const e of match.events) {
    if (e.type === 'STARTING_FIVE' && e.team === 'A')
      for (const id of e.playerIds) { const s = stats.get(id); if (s) s.isStarter = true }
    if (e.type === 'SCORE' && e.team === 'A') {
      if (!e.playerId) continue // panier d'équipe : compté au score, dans la ligne d'aucun joueur
      const s = stats.get(e.playerId); if (!s) continue
      s.points += pointsForKind(e.kind)
      if (e.kind === '3') { s.threes++; s.fieldGoalsMade++ }
      else if (e.kind === '2int') { s.twoInside++; s.fieldGoalsMade++ }
      else if (e.kind === '2ext') { s.twoOutside++; s.fieldGoalsMade++ }
      else s.freeThrows++
    }
    if (e.type === 'MISS' && e.team === 'A') {
      const s = stats.get(e.playerId); if (s) s.misses++
    }
    if (e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player') {
      const s = stats.get(e.target.playerId); if (s) s.fouls++
    }
    if (e.type === 'STAT' && e.team === 'A') {
      const s = stats.get(e.playerId); if (!s) continue
      if (e.stat === 'assist') s.assists++
      else if (e.stat === 'reb_off') s.offRebounds++
      else if (e.stat === 'reb_def') s.defRebounds++
      else if (e.stat === 'block') s.blocks++
    }
  }
  return roster.map((id) => stats.get(id)!)
}
