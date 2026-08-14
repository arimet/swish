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
  /** Temps de jeu cumulé, en secondes. */
  seconds: number
}

const ZERO: CareerTotals = {
  games: 0, points: 0, fieldGoalsMade: 0, misses: 0,
  threes: 0, twoInside: 0, twoOutside: 0, freeThrows: 0,
  assists: 0, offRebounds: 0, defRebounds: 0, blocks: 0, fouls: 0, seconds: 0,
}

/** Un joueur a paru dans la rencontre s'il a du temps de jeu, ou au moins une action
 *  enregistrée. La seconde condition est nécessaire : sans elle, un panier saisi pour
 *  un joueur dont on aurait oublié de pointer l'entrée ferait disparaître sa rencontre. */
function aJoue(s: ReturnType<typeof playerStats>[number], seconds: number): boolean {
  return seconds > 0 || s.points > 0 || s.fouls > 0 || s.assists > 0
    || s.offRebounds > 0 || s.defRebounds > 0 || s.blocks > 0 || s.misses > 0
}

/**
 * Cumuls d'un joueur sur les rencontres où il a réellement paru et qui ont commencé.
 * Être convoqué n'est pas avoir joué : un joueur resté sur le banc n'a pas disputé
 * la rencontre, et la compter fausserait toutes ses moyennes par match.
 */
export function playerCareer(matches: Match[], playerId: string): CareerTotals {
  const t: CareerTotals = { ...ZERO }
  for (const m of matches) {
    if (m.status === 'setup' || !m.roster.includes(playerId)) continue
    const s = playerStats(m).find((x) => x.playerId === playerId)
    if (!s) continue
    const seconds = playingTimes(m).get(playerId) ?? 0
    if (!aJoue(s, seconds)) continue
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
 * Âge révolu à la date donnée. La date de référence est un paramètre plutôt que
 * l'horloge du moment : sans cela, tout test dépendrait du jour où il tourne.
 */
export function ageAt(birthDate: string, at: Date): number {
  const b = new Date(`${birthDate}T00:00:00`)
  let age = at.getFullYear() - b.getFullYear()
  const moisEcoule = at.getMonth() - b.getMonth()
  if (moisEcoule < 0 || (moisEcoule === 0 && at.getDate() < b.getDate())) age--
  return age
}
