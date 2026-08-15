import { describe, expect, it } from 'vitest'
import { kindAt, zoneAt, ZONE_CENTROID, ZONES } from './shotzones'

describe('zoneAt', () => {
  it('classifies a representative point in each zone', () => {
    expect(zoneAt(0.5, 0.15)).toBe('paint')
    expect(zoneAt(0.25, 0.2)).toBe('mid_left')
    expect(zoneAt(0.5, 0.5)).toBe('mid_center')
    expect(zoneAt(0.75, 0.2)).toBe('mid_right')
    expect(zoneAt(0.03, 0.1)).toBe('corner3_left')
    expect(zoneAt(0.97, 0.1)).toBe('corner3_right')
    expect(zoneAt(0.5, 0.65)).toBe('top3')
  })

  it('places each centroid in its own zone', () => {
    for (const z of ZONES) expect(zoneAt(ZONE_CENTROID[z].x, ZONE_CENTROID[z].y)).toBe(z)
  })

  it('below the corner/arc junction, only the corner line counts', () => {
    // 5 cm beyond the corner line: 3 points.
    expect(zoneAt(0.05, 0.05)).toBe('corner3_left')
    // 30 cm inside it: 2 points. The distance to the basket (~6.43 m) stays under
    // the arc's radius — it is the first case above that shows only the corner line
    // decides, whatever the distance.
    expect(zoneAt(0.08, 0.02)).toBe('mid_left')
  })

  it('above the junction, the corner strip becomes a three-point wing', () => {
    expect(zoneAt(0.03, 0.5)).toBe('top3')
  })

  it('a shot just inside the arc is worth 2, just outside it 3', () => {
    expect(zoneAt(0.5, 0.57)).toBe('mid_center')
    expect(zoneAt(0.5, 0.62)).toBe('top3')
  })

  it('leaves the key as soon as its far line is crossed', () => {
    expect(zoneAt(0.5, 0.4)).toBe('paint')
    expect(zoneAt(0.5, 0.43)).toBe('mid_center')
  })
})

describe('kindAt', () => {
  it('derives the basket\'s kind from the zone', () => {
    expect(kindAt(0.5, 0.15)).toBe('2int')
    expect(kindAt(0.25, 0.2)).toBe('2ext')
    expect(kindAt(0.5, 0.65)).toBe('3')
    expect(kindAt(0.03, 0.1)).toBe('3')
  })
})
