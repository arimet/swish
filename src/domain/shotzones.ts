/**
 * Geometry of a FIBA half court (15 × 14 m), measured in metres internally.
 * Public coordinates are normalised: x 0..1 from the left sideline to the right,
 * y 0..1 from the baseline to the half-way line.
 */
const COURT_W = 15
const COURT_D = 14
const BASKET_X = 7.5
const BASKET_Y = 1.575
const ARC_R = 6.75
const CORNER_X = 0.9        // distance from the corner line to the sideline
const PAINT_HALF_W = 2.45
const PAINT_D = 5.8
/** Y of the junction between the corner line and the arc (≈ 2.99 m). */
const CORNER_Y = BASKET_Y + Math.sqrt(ARC_R ** 2 - (BASKET_X - CORNER_X) ** 2)

export type ShotZone =
  | 'paint' | 'mid_left' | 'mid_center' | 'mid_right'
  | 'corner3_left' | 'top3' | 'corner3_right'

export const ZONES: ShotZone[] = [
  'paint', 'mid_left', 'mid_center', 'mid_right', 'corner3_left', 'top3', 'corner3_right',
]

/** The zones' translation **keys**, not their text: the geometry is pure code, called
 *  outside React, with no knowledge of the current language. The caller translates —
 *  the same rule as for the domain's rule messages. */
export const ZONE_LABELS: Record<ShotZone, string> = {
  paint: 'zone.raquette',
  mid_left: 'zone.midGauche',
  mid_center: 'zone.midAxe',
  mid_right: 'zone.midDroite',
  corner3_left: 'zone.cornerGauche',
  top3: 'zone.aile3',
  corner3_right: 'zone.cornerDroit',
}

/**
 * Each zone's visual centre. Anchors the chart's labels, and is the position stored
 * when a shot is entered from the keyboard (a zone with no precise point).
 */
export const ZONE_CENTROID: Record<ShotZone, { x: number; y: number }> = {
  paint: { x: 0.5, y: 0.21 },
  mid_left: { x: 0.22, y: 0.22 },
  mid_center: { x: 0.5, y: 0.47 },
  mid_right: { x: 0.78, y: 0.22 },
  corner3_left: { x: 0.03, y: 0.12 },
  top3: { x: 0.5, y: 0.68 },
  corner3_right: { x: 0.97, y: 0.12 },
}

export function zoneAt(x: number, y: number): ShotZone {
  const mx = x * COURT_W
  const my = y * COURT_D

  // A shot on the line is worth 2: you must be strictly beyond it.
  if (my <= CORNER_Y) {
    // Below the junction it is the corner line (6.60 m from the basket) that bounds
    // the 3-point area, not the arc (6.75 m), which runs further out there.
    if (mx < CORNER_X) return 'corner3_left'
    if (mx > COURT_W - CORNER_X) return 'corner3_right'
  } else if (Math.hypot(mx - BASKET_X, my - BASKET_Y) > ARC_R) {
    return 'top3'
  }

  if (Math.abs(mx - BASKET_X) <= PAINT_HALF_W && my <= PAINT_D) return 'paint'
  if (mx < BASKET_X - PAINT_HALF_W) return 'mid_left'
  if (mx > BASKET_X + PAINT_HALF_W) return 'mid_right'
  return 'mid_center'
}

export const isThree = (z: ShotZone): boolean =>
  z === 'corner3_left' || z === 'corner3_right' || z === 'top3'

export function kindAt(x: number, y: number): '2int' | '2ext' | '3' {
  const z = zoneAt(x, y)
  if (isThree(z)) return '3'
  return z === 'paint' ? '2int' : '2ext'
}
