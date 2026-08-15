import { playerStats, pointsForKind, type PlayerStat } from './boxscore'
import type { Match } from './types'

export interface StatTotals {
  points: number
  fieldGoalsMade: number
  threes: number
  twoInside: number
  twoOutside: number
  freeThrows: number
  fouls: number
  assists: number
  offRebounds: number
  defRebounds: number
  blocks: number
}

export interface TeamTotals {
  team: StatTotals
  starters: StatTotals
  bench: StatTotals
  firstHalf: StatTotals
  secondHalf: StatTotals
  overtime: StatTotals
  coachFouls: number
}

const empty = (): StatTotals => ({
  points: 0,
  fieldGoalsMade: 0,
  threes: 0,
  twoInside: 0,
  twoOutside: 0,
  freeThrows: 0,
  fouls: 0,
  assists: 0,
  offRebounds: 0,
  defRebounds: 0,
  blocks: 0,
})

const addStat = (acc: StatTotals, s: PlayerStat) => {
  acc.points += s.points
  acc.fieldGoalsMade += s.fieldGoalsMade
  acc.threes += s.threes
  acc.twoInside += s.twoInside
  acc.twoOutside += s.twoOutside
  acc.freeThrows += s.freeThrows
  acc.fouls += s.fouls
  acc.assists += s.assists
  acc.offRebounds += s.offRebounds
  acc.defRebounds += s.defRebounds
  acc.blocks += s.blocks
}

/** Our roster's totals (side A). The opponent's score is read through `liveState`. */
export function teamTotals(match: Match): TeamTotals {
  const stats = playerStats(match)
  const team = empty()
  const starters = empty()
  const bench = empty()

  for (const s of stats) {
    addStat(team, s)
    addStat(s.isStarter ? starters : bench, s)
  }

  const firstHalf = empty()
  const secondHalf = empty()
  const overtime = empty()

  const bucketOf = (period: number) => (period <= 2 ? firstHalf : period <= 4 ? secondHalf : overtime)

  let coachFouls = 0

  for (const e of match.events) {
    if (e.type === 'SCORE' && e.team === 'A') {
      bucketOf(e.period).points += pointsForKind(e.kind)
    }
    if (e.type === 'FOUL' && e.team === 'A') {
      if (e.target.kind === 'coach') {
        coachFouls++
      } else if (e.target.kind === 'player') {
        bucketOf(e.period).fouls++
      }
    }
  }

  return { team, starters, bench, firstHalf, secondHalf, overtime, coachFouls }
}
