import type { Match, TeamSide } from './types'

export function playingTimes(match: Match, side: TeamSide): Map<string, number> {
  const times = new Map<string, number>()
  for (const id of match.roster[side]) times.set(id, 0)

  let onCourt = new Set<string>()
  let running = false
  let lastRemaining = 0

  const accrue = (untilRemaining: number) => {
    if (!running) return
    const delta = lastRemaining - untilRemaining // secondes écoulées
    if (delta > 0) for (const id of onCourt) times.set(id, (times.get(id) ?? 0) + delta)
    lastRemaining = untilRemaining
  }

  for (const e of match.events) {
    switch (e.type) {
      case 'STARTING_FIVE':
        if (e.team === side) onCourt = new Set(e.playerIds)
        break
      case 'CLOCK_START':
        running = true; lastRemaining = e.gameClock
        break
      case 'CLOCK_STOP':
        accrue(e.gameClock); running = false
        break
      case 'PERIOD_END':
        accrue(e.gameClock); running = false
        break
      case 'SUBSTITUTION':
        if (e.team === side) {
          accrue(e.gameClock)
          onCourt.delete(e.playerOutId)
          onCourt.add(e.playerInId)
        }
        break
    }
  }
  return times
}
