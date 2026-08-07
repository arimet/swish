/**
 * Géométrie d'un demi-terrain FIBA (15 × 14 m), cotée en mètres en interne.
 * Les coordonnées publiques sont normalisées : x 0..1 de la touche gauche à la
 * touche droite, y 0..1 de la ligne de fond à la ligne médiane.
 */
const COURT_W = 15
const COURT_D = 14
const BASKET_X = 7.5
const BASKET_Y = 1.575
const ARC_R = 6.75
const CORNER_X = 0.9        // distance entre la ligne de corner et la touche
const PAINT_HALF_W = 2.45
const PAINT_D = 5.8
/** Ordonnée de la jonction entre la ligne de corner et l'arc (≈ 2,99 m). */
const CORNER_Y = BASKET_Y + Math.sqrt(ARC_R ** 2 - (BASKET_X - CORNER_X) ** 2)

export type ShotZone =
  | 'paint' | 'mid_left' | 'mid_center' | 'mid_right'
  | 'corner3_left' | 'top3' | 'corner3_right'

export const ZONES: ShotZone[] = [
  'paint', 'mid_left', 'mid_center', 'mid_right', 'corner3_left', 'top3', 'corner3_right',
]

export const ZONE_LABELS: Record<ShotZone, string> = {
  paint: 'Raquette',
  mid_left: 'Mi-distance gauche',
  mid_center: 'Mi-distance axe',
  mid_right: 'Mi-distance droite',
  corner3_left: 'Corner gauche',
  top3: 'Aile / axe a 3 pts',
  corner3_right: 'Corner droit',
}

/**
 * Centre visuel de chaque zone. Sert d'ancre aux libellés de la carte, et de
 * position enregistrée quand le tir est saisi au clavier (zone sans point précis).
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

  // Un tir sur une ligne vaut 2 points : il faut être strictement au-delà.
  if (my <= CORNER_Y) {
    // Sous la jonction, c'est la ligne de corner (6,60 m du panier) qui délimite
    // les 3 points, et non l'arc (6,75 m) qui passe plus loin à cet endroit.
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
