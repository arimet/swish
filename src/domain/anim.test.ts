import { describe, expect, it } from 'vitest'
import { snapshot, refit, transitions } from './anim'
import { newPlay, nextStep, type Play } from './plays'

const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6)
}

describe('refit', () => {
  it('lands the endpoints exactly on the start and the end', () => {
    const trace = [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.6 }, { x: 0.6, y: 0.6 }]
    const r = refit(trace, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.5 })
    proche(r[0], { x: 0.1, y: 0.1 })
    proche(r[r.length - 1], { x: 0.9, y: 0.5 })
  })

  it('preserves the shape: an L stays an L', () => {
    // The corner is a right angle; a similarity preserves angles.
    const trace = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
    const r = refit(trace, { x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 })
    const u = { x: r[0].x - r[1].x, y: r[0].y - r[1].y }
    const v = { x: r[2].x - r[1].x, y: r[2].y - r[1].y }
    expect(u.x * v.x + u.y * v.y).toBeCloseTo(0, 6)   // produit scalaire nul
  })

  it('keeps the proportions along the stroke', () => {
    // The midpoint of a straight segment stays the midpoint after refitting.
    const trace = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }]
    const r = refit(trace, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 })
    proche(r[1], { x: 0.5, y: 0.5 })
  })

  it('falls back to the straight line when the stroke is degenerate', () => {
    // Coincident endpoints: no similarity is defined.
    const trace = [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.5 }, { x: 0.3, y: 0.3 }]
    const r = refit(trace, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })
    expect(r).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])
  })

  it('leaves a stroke of fewer than two points as it is, clamped to the bounds', () => {
    expect(refit([], { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])
  })
})

/** Two steps: position 1 goes down from (0.5,0.62) to (0.5,0.2), the others stay put. */
function twoSteps(): Play {
  const s: Play = { id: 'x', ...newPlay('c1', 'half', false) }
  const t1 = nextStep(s.steps[0])
  t1.markers = t1.markers.map((p) => (p.position === 1 ? { ...p, at: { x: 0.5, y: 0.2 } } : p))
  s.steps = [s.steps[0], t1]
  return s
}

describe('snapshot', () => {
  it('renders exactly the starting step at part 0, and the next at part 1', () => {
    const s = twoSteps()
    expect(snapshot(s, { step: 0, part: 0 }).markers).toEqual(s.steps[0].markers)
    expect(snapshot(s, { step: 0, part: 1 }).markers).toEqual(s.steps[1].markers)
  })

  it('interpolates a marker with no arrow in a straight line', () => {
    const s = twoSteps()
    const p = snapshot(s, { step: 0, part: 0.5 }).markers.find((q) => q.position === 1)!
    expect(p.at.x).toBeCloseTo(0.5, 6)
    expect(p.at.y).toBeCloseTo(0.41, 6)          // (0.62 + 0.2) / 2
  })

  it('leaves a marker that does not move strictly still', () => {
    const s = twoSteps()
    const avant = s.steps[0].markers.find((q) => q.position === 3)!
    const p = snapshot(s, { step: 0, part: 0.37 }).markers.find((q) => q.position === 3)!
    expect(p.at).toEqual(avant.at)
  })

  it('leaves a still marker still despite its arrow', () => {
    // A stroke refitted onto two coincident positions has zero length: the marker
    // must stay put, not drift off into NaN.
    const s = twoSteps()
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 3 },
      points: [{ x: 0.78, y: 0.48 }, { x: 0.6, y: 0.4 }, { x: 0.78, y: 0.48 }],
      stroke: 'screen',
    }] }
    const avant = s.steps[0].markers.find((q) => q.position === 3)!
    const p = snapshot(s, { step: 0, part: 0.37 }).markers.find((q) => q.position === 3)!
    expect(p.at).toEqual(avant.at)
  })

  it('follows the arrow\'s shape rather than the chord', () => {
    // A cut that curves round to the left: halfway along, the marker is off the
    // straight line joining the two positions.
    const s = twoSteps()
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.2, y: 0.41 }, { x: 0.5, y: 0.2 }],
      stroke: 'cut',
    }] }
    const p = snapshot(s, { step: 0, part: 0.5 }).markers.find((q) => q.position === 1)!
    expect(p.at.x).toBeLessThan(0.4)             // clearly left of the chord
  })

  it('refits the arrow: a stroke drawn beside still leads to the real positions', () => {
    // The arrow runs from (0.3,0.7) to (0.3,0.25) — nowhere near the marker.
    // Following the raw stroke would start and land the marker beside itself.
    const s = twoSteps()
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.3, y: 0.7 }, { x: 0.1, y: 0.45 }, { x: 0.3, y: 0.25 }],
      stroke: 'cut',
    }] }
    const tout = (part: number) => snapshot(s, { step: 0, part }).markers.find((q) => q.position === 1)!.at
    expect(Math.hypot(tout(0.01).x - 0.5, tout(0.01).y - 0.62)).toBeLessThan(0.03)
    expect(Math.hypot(tout(0.99).x - 0.5, tout(0.99).y - 0.2)).toBeLessThan(0.03)
  })

  it('advances at constant speed, whatever the density of the stroke\'s points', () => {
    // A straight stroke but densely sampled at the start: parameterising by point
    // index would make the marker crawl at first and then leap at the end.
    const s = twoSteps()
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.6 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.2 }],
      stroke: 'cut',
    }] }
    const p = snapshot(s, { step: 0, part: 0.5 }).markers.find((q) => q.position === 1)!
    expect(p.at.y).toBeCloseTo(0.41, 6)          // half the length, not the point at index 1.5
  })

  it('exposes no arrow: the animation shows the players, not the strokes', () => {
    const s = twoSteps()
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 1 }, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }], stroke: 'cut',
    }] }
    expect(snapshot(s, { step: 0, part: 0.5 }).arrows).toEqual([])
  })

  it('carries the ball to its new holder when it changes hands', () => {
    const s = twoSteps()
    s.steps[1] = { ...s.steps[1], ball: { side: 'offense', position: 3 } }
    const mi = snapshot(s, { step: 0, part: 0.5 })
    const start = s.steps[0].markers.find((q) => q.position === 1)!.at
    const end = s.steps[1].markers.find((q) => q.position === 3)!.at
    // The ball is in flight: on the floor, halfway between the two carriers.
    expect('x' in mi.ball).toBe(true)
    const b = mi.ball as { x: number; y: number }
    expect(b.x).toBeCloseTo((start.x + end.x) / 2, 6)
  })

  it('makes the ball follow the pass arrow, not the chord', () => {
    const s = twoSteps()
    s.steps[1] = { ...s.steps[1], ball: { side: 'offense', position: 3 } }
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.6, y: 0.9 }, { x: 0.78, y: 0.48 }],  // une cloche
      stroke: 'pass',
    }] }
    const b = snapshot(s, { step: 0, part: 0.5 }).ball as { x: number; y: number }
    expect(b.y).toBeGreaterThan(0.7)             // top of the arc, far from the chord
  })

  it('keeps the ball carried when the carrier does not change', () => {
    const s = twoSteps()
    expect(snapshot(s, { step: 0, part: 0.5 }).ball).toEqual({ side: 'offense', position: 1 })
  })

  it('counts the transitions, and renders the last step beyond them', () => {
    const s = twoSteps()
    expect(transitions(s)).toBe(1)
    expect(snapshot(s, { step: 5, part: 0.5 }).markers).toEqual(s.steps[1].markers)
  })
})

/**
 * The movement paths, optional: what the coach sees of the path while the play runs.
 *
 * The contract fits in one sentence: the line is the path **actually travelled**. It
 * is therefore not the drawn arrow — it is that arrow refitted onto the two steps'
 * positions, the same curve that carries the marker. A line diverging from the
 * movement would be worse than no line.
 */
describe('snapshot — the movement paths', () => {
  const ligneDe = (s: Play, part: number, position: number) =>
    snapshot(s, { step: 0, part }, true).arrows.find((f) => f.from.position === position)

  it('emits no path when none is asked for', () => {
    // The historical behaviour: the bare animation. It is still the default.
    const s = twoSteps()
    expect(snapshot(s, { step: 0, part: 0.5 }).arrows).toEqual([])
  })

  it('leads from the starting position to the arrival one', () => {
    const s = twoSteps()
    const l = ligneDe(s, 0.5, 1)!
    proche(l.points[0], { x: 0.5, y: 0.62 })
    proche(l.points[l.points.length - 1], { x: 0.5, y: 0.2 })
  })

  it('stays the same across the whole transition: it is a path, not a trail', () => {
    // The line is not drawn progressively. At 10% as at 90%, it shows the whole
    // path — that is what gets pointed at during a time-out.
    const s = twoSteps()
    expect(ligneDe(s, 0.1, 1)!.points).toEqual(ligneDe(s, 0.9, 1)!.points)
  })

  it('borrows the drawn arrow\'s shape, refitted', () => {
    const s = twoSteps()
    s.steps[0] = { ...s.steps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.3, y: 0.7 }, { x: 0.1, y: 0.45 }, { x: 0.3, y: 0.25 }],   // dessinée à côté
      stroke: 'cut',
    }] }
    const l = ligneDe(s, 0.5, 1)!
    // Endpoints refitted onto the real positions…
    proche(l.points[0], { x: 0.5, y: 0.62 })
    proche(l.points[l.points.length - 1], { x: 0.5, y: 0.2 })
    // …and the belly of the curve kept, hence off the chord.
    expect(Math.min(...l.points.map((p) => p.x))).toBeLessThan(0.45)
    expect(l.stroke).toBe('cut')
  })

  it('gives a straight line to a marker that moves with no arrow drawn', () => {
    // Otherwise the toggle would light some movements and not others, which reads
    // as a fault rather than as a rule.
    const s = twoSteps()
    const l = ligneDe(s, 0.5, 1)!
    expect(l.points).toEqual([{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }])
    expect(l.stroke).toBe('cut')
  })

  it('ignores still markers', () => {
    const s = twoSteps()
    expect(ligneDe(s, 0.5, 3)).toBeUndefined()
  })

  it('draws the pass when the ball changes hands', () => {
    const s = twoSteps()
    s.steps[1] = { ...s.steps[1], ball: { side: 'offense', position: 3 } }
    const pass = snapshot(s, { step: 0, part: 0.5 }, true).arrows.find((f) => f.stroke === 'pass')!
    expect(pass).toBeDefined()
    proche(pass.points[0], { x: 0.5, y: 0.62 })          // the carrier at the start
    proche(pass.points[pass.points.length - 1], { x: 0.78, y: 0.48 })   // le receveur
  })

  it('draws no pass when the ball does not change hands', () => {
    const s = twoSteps()
    expect(snapshot(s, { step: 0, part: 0.5 }, true).arrows.some((f) => f.stroke === 'pass')).toBe(false)
  })

  it('emits nothing on the last step, which has nothing after it', () => {
    const s = twoSteps()
    expect(snapshot(s, { step: 1, part: 0 }, true).arrows).toEqual([])
  })

  it('shows the path from the first instant, before anything has moved', () => {
    // At part 0 the markers are still at the drawn positions, but the line must
    // already be there: it announces the gesture, it does not comment on it after.
    const s = twoSteps()
    expect(ligneDe(s, 0, 1)).toBeDefined()
  })
})
