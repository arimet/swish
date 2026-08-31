import { describe, expect, it } from 'vitest'
import {
  addPlayer, folders, freePosition, markerNear, newPlay, nextStep, receiver, removePlayer,
  simplifyPath, toCourt, type Play, type Position, type Side,
} from './plays'

const POSITIONS: Position[] = [1, 2, 3, 4, 5]

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

/**
 * Adding and removing a player.
 *
 * A coach needs a lone defender for a two-on-one, four attackers for a drill, and a
 * way back when they misplace one — the same tool that drops a cone or a ball. Five
 * per side is the ceiling, and a freed number is handed back.
 */
describe('addPlayer', () => {
  const blank = () => ({ id: 's1', ...newPlay('ta', 'half', false) }) as Play

  it('adds the player to every step, not only the one on screen', () => {
    // Every step carries the complete set of markers: a player present in one step and
    // absent from the next has no counterpart to travel towards, and `snapshot` would
    // leave them standing still through a play they are supposed to be in.
    const twoSteps = { ...blank(), steps: [blank().steps[0], nextStep(blank().steps[0])] }
    const withGap = removePlayer(twoSteps, 'offense', 3)
    const after = addPlayer(withGap, 'offense', { x: 0.1, y: 0.9 })
    for (const t of after.steps) {
      expect(t.markers.filter((m) => m.side === 'offense')).toHaveLength(5)
      expect(t.markers.find((m) => m.position === 3)!.at).toEqual({ x: 0.1, y: 0.9 })
    }
  })

  it('gives back the lowest free number, not the next one up', () => {
    // Five postes, and a freed one is reused: remove the 3 and the newcomer is the 3.
    // Handing out a 6 would name a poste that does not exist.
    const gap = removePlayer(removePlayer(blank(), 'offense', 2), 'offense', 4)
    const after = addPlayer(gap, 'offense', { x: 0.5, y: 0.5 })
    expect(after.steps[0].markers.filter((m) => m.side === 'offense').map((m) => m.position).sort())
      .toEqual([1, 2, 3, 5])
  })

  it('refuses a sixth: five per side is the game, and it is refused here too', () => {
    // The editor greys the control out. This is what makes the limit true whatever
    // calls it.
    const full = blank()
    expect(freePosition(full, 'offense')).toBeNull()
    expect(addPlayer(full, 'offense', { x: 0.5, y: 0.5 })).toBe(full)
  })

  it('will not reuse a number still standing in another step', () => {
    // A play carries the same markers at every step, so this does not normally arise —
    // but reusing a live number would merge two players into one and make every arrow
    // naming it ambiguous.
    const twoSteps = { ...blank(), steps: [blank().steps[0], nextStep(blank().steps[0])] }
    twoSteps.steps[0].markers = twoSteps.steps[0].markers.filter((m) => m.position !== 3)
    expect(freePosition(twoSteps, 'offense')).toBeNull()
  })

  it('the first opponent turns the defence on', () => {
    // Otherwise the board shows a defender the play claims not to have, and the
    // "Defence" toggle reads the flag rather than the markers.
    const after = addPlayer(blank(), 'defense', { x: 0.5, y: 0.3 })
    expect(after.defense).toBe(true)
    expect(after.steps[0].markers.filter((m) => m.side === 'defense')).toHaveLength(1)
  })
})

describe('removePlayer', () => {
  const blank = () => ({ id: 's1', ...newPlay('ta', 'half', true) }) as Play

  it('takes the arrows that named them', () => {
    const s = blank()
    s.steps[0].arrows = [
      { from: { side: 'offense', position: 2 }, points: [{ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.4 }], stroke: 'cut' },
      { from: { side: 'offense', position: 3 }, points: [{ x: 0.8, y: 0.5 }, { x: 0.7, y: 0.4 }], stroke: 'cut' },
    ]
    const after = removePlayer(s, 'offense', 2)
    expect(after.steps[0].arrows.map((a) => a.from.position)).toEqual([3])
  })

  it('drops the ball on the floor where the carrier stood, rather than inventing a pass', () => {
    // Handing it to a teammate would be drawing a pass the coach never drew. On the
    // floor it is visible, obviously wrong, and one tap from being right.
    const s = blank()
    const carrier = s.steps[0].markers.find((m) => m.side === 'offense' && m.position === 1)!
    const after = removePlayer(s, 'offense', 1)
    expect(after.steps[0].ball).toEqual({ x: carrier.at.x, y: carrier.at.y })
  })

  it('turns the defence off with the last defender', () => {
    let s = blank()
    for (const position of POSITIONS) s = removePlayer(s, 'defense', position)
    expect(s.defense).toBe(false)
    expect(s.steps[0].markers.every((m) => m.side === 'offense')).toBe(true)
  })

  it('refuses to remove the last attacker', () => {
    // A play with nobody to carry the ball is a state no screen can draw.
    let s = { id: 's1', ...newPlay('ta', 'half', false) } as Play
    for (const position of POSITIONS) s = removePlayer(s, 'offense', position)
    expect(s.steps[0].markers.filter((m) => m.side === 'offense')).toHaveLength(1)
  })
})

/**
 * The pass hands the ball over.
 *
 * A coach who draws a pass from 1 to 2 has said who has the ball next. Making them
 * then place the ball by hand asked for the same fact twice, and the step where they
 * forgot showed it still in the passer's hands.
 */
describe('receiver, and the ball at the next step', () => {
  const withPass = (from: { side: Side; position: Position }, endsOn: Position) => {
    const s = { id: 's1', ...newPlay('ta', 'half', false) } as Play
    const target = s.steps[0].markers.find((m) => m.side === 'offense' && m.position === endsOn)!
    s.steps[0].arrows = [{ from, points: [{ x: 0.5, y: 0.62 }, { ...target.at }], stroke: 'pass' }]
    return s
  }

  it('hands the ball to the marker the pass lands on', () => {
    const s = withPass({ side: 'offense', position: 1 }, 2)
    expect(receiver(s.steps[0])).toEqual({ side: 'offense', position: 2 })
    expect(nextStep(s.steps[0]).ball).toEqual({ side: 'offense', position: 2 })
  })

  it('ignores a pass drawn between two other players', () => {
    // A pass that does not start from the carrier is a drawing — a second option, a
    // reminder — and must not move a ball that was never in that hand.
    const s = withPass({ side: 'offense', position: 4 }, 2)
    expect(receiver(s.steps[0])).toBeNull()
    expect(nextStep(s.steps[0]).ball).toEqual({ side: 'offense', position: 1 })
  })

  it('ignores a cut, even one that ends on a teammate', () => {
    const s = withPass({ side: 'offense', position: 1 }, 2)
    s.steps[0].arrows[0].stroke = 'cut'
    expect(receiver(s.steps[0])).toBeNull()
  })

  it('ignores a pass that lands on nobody', () => {
    const s = { id: 's1', ...newPlay('ta', 'half', false) } as Play
    s.steps[0].arrows = [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.02, y: 0.98 }], stroke: 'pass',
    }]
    expect(receiver(s.steps[0])).toBeNull()
  })

  it('the last pass wins: redrawing is correcting, not adding', () => {
    const s = withPass({ side: 'offense', position: 1 }, 2)
    const three = s.steps[0].markers.find((m) => m.position === 3 && m.side === 'offense')!
    s.steps[0].arrows.push({
      from: { side: 'offense', position: 1 }, points: [{ x: 0.5, y: 0.62 }, { ...three.at }], stroke: 'pass',
    })
    expect(receiver(s.steps[0])).toEqual({ side: 'offense', position: 3 })
  })
})

describe('markerNear — the magnet', () => {
  const blank = () => ({ id: 's1', ...newPlay('ta', 'half', false) } as Play).steps[0]

  it('finds the marker just off the finger, and none when it is far', () => {
    const t = blank()
    const two = t.markers.find((m) => m.position === 2)!
    expect(markerNear(t, { x: two.at.x + 0.03, y: two.at.y })?.position).toBe(2)
    expect(markerNear(t, { x: two.at.x + 0.2, y: two.at.y })).toBeNull()
  })

  it('never returns the marker the gesture started from', () => {
    // An arrow ending on its own author is a zero-length stroke, not a pass to oneself.
    const t = blank()
    const one = t.markers.find((m) => m.position === 1)!
    expect(markerNear(t, one.at, { side: 'offense', position: 1 })).toBeNull()
  })
})
