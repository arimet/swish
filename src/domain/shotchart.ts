import { isThree, zoneAt, ZONES, type ShotZone } from './shotzones'
import type { Match, ShotSpot } from './types'

export interface Shot { matchId: string; spot: ShotSpot; zone: ShotZone; made: boolean }
export interface ZoneTally { made: number; attempts: number }

/**
 * Tirs positionnés d'un joueur. Un seul match en entrée donne la hot zone du
 * match, tous ses matchs donnent celle de sa carrière : même fonction.
 * Les lancers francs et les paniers saisis sans position sont exclus — ils
 * n'ont pas de coordonnée et fausseraient les pourcentages par zone.
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

/** Réussite en pourcentage entier. `null` quand il n'y a aucun tir : afficher
 *  « 0 % » à un joueur qui n'a pas tiré serait faux. */
export function shootingPct(shots: Shot[]): { fg: number | null; three: number | null } {
  const pct = (s: Shot[]) => (s.length ? Math.round((s.filter((x) => x.made).length / s.length) * 100) : null)
  return { fg: pct(shots), three: pct(shots.filter((s) => isThree(s.zone))) }
}
