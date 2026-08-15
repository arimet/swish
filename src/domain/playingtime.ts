import type { Match } from './types'

/** Our roster's playing time (side A). No players are entered for the opponent. */
export function playingTimes(match: Match): Map<string, number> {
  const times = new Map<string, number>()
  for (const id of match.roster) times.set(id, 0)

  let onCourt = new Set<string>()
  let running = false
  let lastRemaining = 0

  const accrue = (untilRemaining: number) => {
    if (!running) return
    const delta = lastRemaining - untilRemaining // seconds elapsed
    if (delta > 0) for (const id of onCourt) times.set(id, (times.get(id) ?? 0) + delta)
    lastRemaining = untilRemaining
  }

  for (const e of match.events) {
    switch (e.type) {
      case 'STARTING_FIVE':
        if (e.team === 'A') onCourt = new Set(e.playerIds)
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
        if (e.team === 'A') {
          accrue(e.gameClock)
          onCourt.delete(e.playerOutId)
          onCourt.add(e.playerInId)
        }
        break
    }
  }
  return times
}
