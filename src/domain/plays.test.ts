import { describe, expect, it } from 'vitest'
import { folders, newPlay, nextStep, simplifyPath, toCourt, type Play } from './plays'

describe('newPlay', () => {
  it('lays out a 1-2-2 of five attackers, ball with the point guard, on a half court', () => {
    const s = newPlay('c1', 'half', false)
    expect(s.steps).toHaveLength(1)
    expect(s.steps[0].markers).toHaveLength(5)
    expect(s.steps[0].markers.every((p) => p.side === 'offense')).toBe(true)
    expect(s.steps[0].ball).toEqual({ side: 'offense', position: 1 })
    // 1-2-2: the point guard is furthest from the basket (largest y, baseline at the top)
    const pointGuard = s.steps[0].markers.find((p) => p.position === 1)!
    expect(Math.max(...s.steps[0].markers.map((p) => p.at.y))).toBe(pointGuard.at.y)
  })

  it('adds five defenders, each between their attacker and the basket', () => {
    const s = newPlay('c1', 'half', true)
    expect(s.steps[0].markers).toHaveLength(10)
    const att1 = s.steps[0].markers.find((p) => p.side === 'offense' && p.position === 1)!
    const def1 = s.steps[0].markers.find((p) => p.side === 'defense' && p.position === 1)!
    // Closer to the basket (0.5, 0.1125) than their attacker
    const d = (pt: { x: number; y: number }) => Math.hypot(pt.x - 0.5, pt.y - 0.1125)
    expect(d(def1.at)).toBeLessThan(d(att1.at))
  })

  it('occupies the front court on a full court', () => {
    const s = newPlay('c1', 'full', true)
    expect(s.steps[0].markers.every((p) => p.at.y <= 0.5)).toBe(true)
  })
})

describe('nextStep', () => {
  it('inherits the positions and the ball, never the arrows', () => {
    const s = newPlay('c1', 'half', false)
    const t0 = { ...s.steps[0], arrows: [{ from: { side: 'offense' as const, position: 1 as const }, points: [{ x: 0.5, y: 0.7 }, { x: 0.4, y: 0.3 }], stroke: 'cut' as const }] }
    const t1 = nextStep(t0)
    expect(t1.markers).toEqual(t0.markers)
    expect(t1.markers).not.toBe(t0.markers)          // a copy, not the same reference
    expect(t1.ball).toEqual(t0.ball)
    expect(t1.arrows).toEqual([])
  })
})

describe('simplifyPath', () => {
  it('keeps the corner of an L-shaped stroke', () => {
    // An L: a vertical descent then a horizontal run, sampled at 41 points
    const pts = [
      ...Array.from({ length: 21 }, (_, i) => ({ x: 0.2, y: 0.2 + i * 0.02 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 0.2 + (i + 1) * 0.02, y: 0.6 })),
    ]
    const r = simplifyPath(pts)
    expect(r.length).toBeLessThanOrEqual(5)
    // The corner (0.2, 0.6) survives the reduction
    expect(r.some((p) => Math.hypot(p.x - 0.2, p.y - 0.6) < 0.01)).toBe(true)
    // The endpoints are kept exactly
    expect(r[0]).toEqual(pts[0]); expect(r[r.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('heavily reduces a noisy gesture without distorting it', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ x: 0.1 + i * 0.004, y: 0.5 + Math.sin(i / 8) * 0.001 }))
    const r = simplifyPath(pts)
    expect(r.length).toBeLessThanOrEqual(10)
  })

  it('leaves a stroke of fewer than three points as it is', () => {
    const pts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }]
    expect(simplifyPath(pts)).toEqual(pts)
  })
})

describe('toCourt', () => {
  it('remaps half to full into the front court, losing nothing', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'half', false) }
    const r = toCourt(s, 'full')
    if ('refused' in r) throw new Error(r.refused.key)
    expect(r.ok.court).toBe('full')
    expect(r.ok.steps[0].markers.every((p) => p.at.y <= 0.5)).toBe(true)
  })

  it('refuses full to half while the back court is occupied, naming the occupant', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'full', false) }
    s.steps[0].markers[2].at = { x: 0.5, y: 0.8 }   // position 3 in the back court
    const r = toCourt(s, 'half')
    expect('refused' in r && r.refused).toEqual({ key: 'play.occPosition', n: 3 })
  })

  it('accepts full to half when everything fits in the front court', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'full', false) }
    const r = toCourt(s, 'half')
    if ('refused' in r) throw new Error(r.refused.key)
    expect(r.ok.court).toBe('half')
    // round trip: we land back (to within rounding) on the half court's 1-2-2
    const attendu = newPlay('c1', 'half', false)
    r.ok.steps[0].markers.forEach((p, i) => {
      expect(p.at.x).toBeCloseTo(attendu.steps[0].markers[i].at.x, 6)
      expect(p.at.y).toBeCloseTo(attendu.steps[0].markers[i].at.y, 6)
    })
  })

  it('same court: returns the play unchanged', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'half', false) }
    const r = toCourt(s, 'half')
    expect('ok' in r && r.ok).toEqual(s)
  })
})

describe('folders', () => {
  it('derives the folder list from the plays, sorted and deduplicated', () => {
    const s = (name: string, folder?: string): Play => ({ id: name, ...newPlay('c1', 'half', false), name, folder })
    expect(folders([s('a', 'Remises en jeu'), s('b', 'Attaque placée'), s('c', 'Remises en jeu'), s('d')]))
      .toEqual(['Attaque placée', 'Remises en jeu'])
  })

  it('returns no folder when no play declares one', () => {
    const s: Play = { id: 'a', ...newPlay('c1', 'half', false) }
    expect(folders([s])).toEqual([])
  })
})
