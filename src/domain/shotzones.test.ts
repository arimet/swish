import { describe, expect, it } from 'vitest'
import { kindAt, zoneAt, ZONE_CENTROID, ZONES } from './shotzones'

describe('zoneAt', () => {
  it('classe un point représentatif dans chaque zone', () => {
    expect(zoneAt(0.5, 0.15)).toBe('paint')
    expect(zoneAt(0.25, 0.2)).toBe('mid_left')
    expect(zoneAt(0.5, 0.5)).toBe('mid_center')
    expect(zoneAt(0.75, 0.2)).toBe('mid_right')
    expect(zoneAt(0.03, 0.1)).toBe('corner3_left')
    expect(zoneAt(0.97, 0.1)).toBe('corner3_right')
    expect(zoneAt(0.5, 0.65)).toBe('top3')
  })

  it('place chaque centroïde dans sa propre zone', () => {
    for (const z of ZONES) expect(zoneAt(ZONE_CENTROID[z].x, ZONE_CENTROID[z].y)).toBe(z)
  })

  it('sous la jonction corner/arc, seule la ligne de corner compte', () => {
    // À 5 cm au-delà de la ligne de corner : 3 points.
    expect(zoneAt(0.05, 0.05)).toBe('corner3_left')
    // À 30 cm en deçà : 2 points, même si la distance au panier dépasse 6,75 m.
    expect(zoneAt(0.08, 0.02)).toBe('mid_left')
  })

  it('au-dessus de la jonction, la bande de corner devient une aile à 3 points', () => {
    expect(zoneAt(0.03, 0.5)).toBe('top3')
  })

  it('un tir juste en deçà de l\'arc vaut 2, juste au-delà vaut 3', () => {
    expect(zoneAt(0.5, 0.57)).toBe('mid_center')
    expect(zoneAt(0.5, 0.62)).toBe('top3')
  })

  it('sort de la raquette dès qu\'on dépasse sa ligne de fond', () => {
    expect(zoneAt(0.5, 0.4)).toBe('paint')
    expect(zoneAt(0.5, 0.43)).toBe('mid_center')
  })
})

describe('kindAt', () => {
  it('déduit le type de panier de la zone', () => {
    expect(kindAt(0.5, 0.15)).toBe('2int')
    expect(kindAt(0.25, 0.2)).toBe('2ext')
    expect(kindAt(0.5, 0.65)).toBe('3')
    expect(kindAt(0.03, 0.1)).toBe('3')
  })
})
