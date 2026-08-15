import { playerStats } from './boxscore'
import { playingTimes } from './playingtime'
import type { Match } from './types'

export interface CareerTotals {
  games: number
  points: number
  fieldGoalsMade: number; misses: number
  threes: number; twoInside: number; twoOutside: number; freeThrows: number
  assists: number; offRebounds: number; defRebounds: number; blocks: number
  fouls: number
  /** Cumulative playing time, in seconds. */
  seconds: number
}

const ZERO: CareerTotals = {
  games: 0, points: 0, fieldGoalsMade: 0, misses: 0,
  threes: 0, twoInside: 0, twoOutside: 0, freeThrows: 0,
  assists: 0, offRebounds: 0, defRebounds: 0, blocks: 0, fouls: 0, seconds: 0,
}

/** A player appeared in the game if he has playing time, or at least one recorded
 *  action. The second condition is necessary: without it, a basket entered for a player
 *  whose entry onto the court was never logged would make his game vanish. */
function played(s: ReturnType<typeof playerStats>[number], seconds: number): boolean {
  return seconds > 0 || s.points > 0 || s.fouls > 0 || s.assists > 0
    || s.offRebounds > 0 || s.defRebounds > 0 || s.blocks > 0 || s.misses > 0
}

/**
 * A player's totals over the games he actually appeared in and that started. Being
 * called up is not playing: a player who stayed on the bench did not contest the game,
 * and counting it would distort every per-game average.
 */
export function playerCareer(matches: Match[], playerId: string): CareerTotals {
  const t: CareerTotals = { ...ZERO }
  for (const m of matches) {
    if (m.status === 'setup' || !m.roster.includes(playerId)) continue
    const s = playerStats(m).find((x) => x.playerId === playerId)
    if (!s) continue
    const seconds = playingTimes(m).get(playerId) ?? 0
    if (!played(s, seconds)) continue
    t.games++
    t.points += s.points
    t.fieldGoalsMade += s.fieldGoalsMade; t.misses += s.misses
    t.threes += s.threes; t.twoInside += s.twoInside; t.twoOutside += s.twoOutside
    t.freeThrows += s.freeThrows
    t.assists += s.assists; t.offRebounds += s.offRebounds; t.defRebounds += s.defRebounds
    t.blocks += s.blocks; t.fouls += s.fouls
    t.seconds += seconds
  }
  return t
}

/**
 * Completed age at the given date. The reference date is a parameter rather than the
 * current clock: without that, every test would depend on the day it runs.
 */
export function ageAt(birthDate: string, at: Date): number {
  const b = new Date(`${birthDate}T00:00:00`)
  let age = at.getFullYear() - b.getFullYear()
  const moisEcoule = at.getMonth() - b.getMonth()
  if (moisEcoule < 0 || (moisEcoule === 0 && at.getDate() < b.getDate())) age--
  return age
}
