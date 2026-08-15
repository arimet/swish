import { isThree, zoneAt, ZONES, type ShotZone } from './shotzones'
import type { Match, ShotSpot } from './types'

export interface Shot { matchId: string; spot: ShotSpot; zone: ShotZone; made: boolean }
export interface ZoneTally { made: number; attempts: number }

/**
 * A player's located shots. One game in gives that game's hot zone, all his games give
 * his career's: the same function. Free throws and baskets entered without a position
 * are excluded — they have no coordinate and would distort the per-zone percentages.
 */
export function shotsOf(matches: Match[], playerId: string): Shot[] {
  const out: Shot[] = []
  for (const m of matches)
    for (const e of m.events) {
      if (e.type === 'SCORE' && e.playerId === playerId && e.shot)
        out.push({ matchId: m.id, spot: e.shot, zone: zoneAt(e.shot.x, e.shot.y), made: true })
      else if (e.type === 'MISS' && e.playerId === playerId)
        out.push({ matchId: m.id, spot: e.shot, zone: zoneAt(e.shot.x, e.shot.y), made: false })
    }
  return out
}

export function zoneSummary(shots: Shot[]): Record<ShotZone, ZoneTally> {
  const acc = Object.fromEntries(ZONES.map((z) => [z, { made: 0, attempts: 0 }])) as Record<ShotZone, ZoneTally>
  for (const s of shots) {
    acc[s.zone].attempts++
    if (s.made) acc[s.zone].made++
  }
  return acc
}

/** Accuracy as a whole percentage. `null` when there are no shots: showing "0 %" to a
 *  player who never shot would be wrong. */
export function shootingPct(shots: Shot[]): { fg: number | null; three: number | null } {
  const pct = (s: Shot[]) => (s.length ? Math.round((s.filter((x) => x.made).length / s.length) * 100) : null)
  return { fg: pct(shots), three: pct(shots.filter((s) => isThree(s.zone))) }
}
