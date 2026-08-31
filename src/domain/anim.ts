/**
 * The animation domain: where is each thing at time t?
 *
 * An arrow is a drawing, not a trajectory — nothing in the model ties the end of a
 * stroke to a marker's position at the following step. So we interpolate between the
 * steps' positions, the only pair the model guarantees to be consistent, and the arrow
 * merely bends the path once fitted onto them.
 */
import type { Side, Arrow, Marker, Point, Position, Play, Step, Stroke } from './plays'

/** Progress through the play: `steps` is the index of the starting step, `part` the
 *  fraction travelled towards the next one (0 to 1). */
export interface Instant { step: number; part: number }

/** How many transitions can be animated — a three-step play has two. */
export const transitions = (s: Play) => Math.max(0, s.steps.length - 1)

/** The strokes that move a marker; a `pass` moves the ball, not the player. */
const MARKER_STROKES: Stroke[] = ['cut', 'screen', 'dribble']

/**
 * Applies to the stroke the similarity — rotation, uniform scale, translation — that
 * sends its first point onto `start` and its last onto `end`. The gesture's shape is
 * preserved and the endpoints become exact. A degenerate stroke (coincident
 * endpoints) has no defined similarity: we fall back on the straight line.
 */
export function refit(points: Point[], start: Point, end: Point): Point[] {
  if (points.length < 2) return [start, end]
  const a = points[0], b = points[points.length - 1]
  const dx = b.x - a.x, dy = b.y - a.y
  const n = dx * dx + dy * dy
  if (n === 0) return [start, end]
  const ex = end.x - start.x, ey = end.y - start.y
  // Complex number (k + i·r) = (end - start) / (b - a): rotation plus scale.
  const k = (ex * dx + ey * dy) / n
  const r = (ey * dx - ex * dy) / n
  return points.map((p) => {
    const ux = p.x - a.x, uy = p.y - a.y
    return { x: start.x + k * ux - r * uy, y: start.y + r * ux + k * uy }
  })
}

/** Linear interpolation between two points. */
const between = (a: Point, b: Point, t: number): Point => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })

/**
 * The position at fraction `part` of the stroke's **length**. Cumulative length is
 * what counts, not the index of the points: a gesture sampled densely at the start
 * would slow down there and leap afterwards, for no reason at all.
 */
function advanceAlong(points: Point[], part: number): Point {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const target = part * cumulative[cumulative.length - 1]
  let i = 1
  while (i < points.length - 1 && cumulative[i] < target) i++
  // A zero-length segment — degenerate stroke, or two coincident points: we stay put
  // rather than divide by zero and drift off into NaN.
  const segment = cumulative[i] - cumulative[i - 1]
  return between(points[i - 1], points[i], segment === 0 ? 0 : (target - cumulative[i - 1]) / segment)
}

/** Where a step's ball is: the position of whoever carries it, or the floor. */
function ballAt(t: Step): Point | null {
  const b = t.ball
  if ('x' in b) return b
  const carrier = t.markers.find((p) => p.side === b.side && p.position === b.position)
  return carrier ? carrier.at : null
}

/** Is the ball held by the same thing at both steps? */
function sameBall(a: Step['ball'], b: Step['ball']): boolean {
  if ('x' in a) return 'x' in b && a.x === b.x && a.y === b.y
  return !('x' in b) && a.side === b.side && a.position === b.position
}

/**
 * A play frozen at time `at`, returned as a `Step` — so the board can render it
 * directly. Each marker travels from its position at step N to that of the same marker
 * at step N+1; its arrow, fitted onto those two positions, only bends the path.
 *
 * `withPaths` decides what `arrows` carries. Off — the default — the snapshot carries
 * none: during the animation you watch the players, not the strokes. On, it carries the
 * **paths actually travelled**: not the arrows as drawn, but those same arrows refitted
 * onto the two steps' positions, which is exactly the curve carrying each marker.
 *
 * That distinction is the whole point of the option. Re-showing the arrows as drawn
 * would be simpler, and wrong: they start from the drawn positions while the markers
 * are elsewhere, and the offset would read as a malfunction. A line diverging from the
 * movement it claims to describe would be worse than no line at all.
 */
export function snapshot(s: Play, at: Instant, withPaths = false): Step {
  const n = Math.max(0, Math.min(Math.floor(at.step), transitions(s)))
  const from = s.steps[n]
  const next = s.steps[n + 1]
  // The annotations travel with the snapshot: they belong to the step the way the
  // props belong to the play, and a circle round the key that vanishes the moment you
  // press Play was read as a bug.
  const brush = from.brush ? { brush: structuredClone(from.brush) } : {}
  if (!next) return { markers: structuredClone(from.markers), ball: structuredClone(from.ball), arrows: [], ...brush }
  const part = Math.max(0, Math.min(at.part, 1))

  const arrowFrom = (side: Side, position: Position, strokes: Stroke[]): Arrow | undefined =>
    from.arrows.find((f) => f.from.side === side && f.from.position === position && strokes.includes(f.stroke))

  /** The complete path, computed once: the drawn curve refitted onto the two
   *  positions, or the chord when nothing was drawn. This same list of points both
   *  places the moving marker **and** draws the line — which is why they cannot
   *  contradict each other. */
  const path = (start: Point, end: Point, f: Arrow | undefined): Point[] =>
    f ? refit(f.points, start, end) : [start, end]

  /** The lines emitted, in the order the moving markers generate them. */
  const lines: Arrow[] = []

  const markers = from.markers.map((marker): Marker => {
    const counterpart = next.markers.find((q) => q.side === marker.side && q.position === marker.position)
    const end = counterpart?.at ?? marker.at      // absent at the next step: it does not move
    const still = end.x === marker.at.x && end.y === marker.at.y
    const drawn = arrowFrom(marker.side, marker.position, MARKER_STROKES)
    // The line is computed even at the bounds: at `part` 0 nothing has moved yet, but
    // the path must already show — it announces the gesture, it does not comment on it
    // afterwards. A stationary marker gets none: it has no path.
    if (withPaths && !still) {
      lines.push({
        from: { side: marker.side, position: marker.position },
        points: path(marker.at, end, drawn),
        // With no arrow drawn, the movement is a cut: that is the neutral stroke of
        // the playbook, and the toggle must light up *every* movement
        // — showing only some of them would read as a fault.
        stroke: drawn?.stroke ?? 'cut',
      })
    }
    // Still, or at the bounds: the step's exact value, with no interpolation to shiver.
    if (still || part <= 0) return { ...marker, at: { ...marker.at } }
    if (part >= 1) return { ...marker, at: { ...end } }
    return { ...marker, at: advanceAlong(path(marker.at, end, drawn), part) }
  })

  const ball = ((): Step['ball'] => {
    if (sameBall(from.ball, next.ball)) return structuredClone(from.ball)
    const start = ballAt(from)
    const end = ballAt(next)
    if (!start || !end) return structuredClone(from.ball)
    // In flight: neither carried nor resting where it was. A pass arrow from the carrier bends the path.
    const pass = 'x' in from.ball ? undefined : arrowFrom(from.ball.side, from.ball.position, ['pass'])
    const flight = path(start, end, pass)
    // A pass is a movement like any other, and the coach shows it as much as the cuts:
    // it gets its line, dashed since that is its stroke.
    if (withPaths && 'x' in from.ball === false) {
      lines.push({ from: from.ball, points: flight, stroke: 'pass' })
    }
    if (part <= 0) return structuredClone(from.ball)
    if (part >= 1) return structuredClone(next.ball)
    return advanceAlong(flight, part)
  })()

  return { markers, ball, arrows: lines, ...brush }
}
