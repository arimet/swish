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
const TRAITS_DE_PION: Stroke[] = ['cut', 'screen', 'dribble']

/**
 * Applies to the stroke the similarity — rotation, uniform scale, translation —
 * qui envoie son premier point sur `start` et son dernier sur `end`. La
 * shape of the gesture is preserved and the endpoints become exact. A degenerate
 * stroke (endpoints coincident) has no defined similarity: we fall back
 * sur la ligne droite.
 */
export function recaler(points: Point[], start: Point, end: Point): Point[] {
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
const entre = (a: Point, b: Point, t: number): Point => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })

/**
 * The position at fraction `part` of the stroke's **length**. Cumulative length is
 * what counts, not the index of the points: a gesture sampled densely at the start
 * would slow down there and leap afterwards, for no reason at all.
 */
function avanceSur(points: Point[], part: number): Point {
  const cumul = [0]
  for (let i = 1; i < points.length; i++) {
    cumul.push(cumul[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const vise = part * cumul[cumul.length - 1]
  let i = 1
  while (i < points.length - 1 && cumul[i] < vise) i++
  // A zero-length segment — degenerate stroke, or two coincident points: we stay put
  // rather than divide by zero and drift off into NaN.
  const segment = cumul[i] - cumul[i - 1]
  return entre(points[i - 1], points[i], segment === 0 ? 0 : (vise - cumul[i - 1]) / segment)
}

/** Where a step's ball is: the position of whoever carries it, or the floor. */
function ballAt(t: Step): Point | null {
  const b = t.ball
  if ('x' in b) return b
  const porteur = t.markers.find((p) => p.side === b.side && p.position === b.position)
  return porteur ? porteur.at : null
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
 * `withPaths` decides what `arrows` carries. Off — the default, and the only behaviour
 * that used to exist — the snapshot carries none: during the animation you watch the
 * players, not the strokes. On, it carries the **paths actually travelled**: not the
 * arrows as drawn, but those same arrows refitted onto the two steps' positions, which
 * is exactly the curve carrying each marker.
 *
 * That distinction is the whole point of the option. Re-showing the arrows as drawn
 * would be simpler, and wrong: they start from the drawn positions while the markers
 * are elsewhere, and the offset would read as a malfunction. A line diverging from the
 * movement it claims to describe would be worse than no line at all.
 */
export function snapshot(s: Play, at: Instant, withPaths = false): Step {
  const n = Math.max(0, Math.min(Math.floor(at.step), transitions(s)))
  const from = s.steps[n]
  const vers = s.steps[n + 1]
  if (!vers) return { markers: structuredClone(from.markers), ball: structuredClone(from.ball), arrows: [] }
  const part = Math.max(0, Math.min(at.part, 1))

  const flecheDe = (side: Side, position: Position, traits: Stroke[]): Arrow | undefined =>
    from.arrows.find((f) => f.from.side === side && f.from.position === position && traits.includes(f.stroke))

  /** The complete path, computed once: the drawn curve refitted onto the two
   *  positions, or the chord when nothing was drawn. This same list of points both
   *  places the moving marker **and** draws the line — which is why they cannot
   *  contradict each other. */
  const chemin = (start: Point, end: Point, f: Arrow | undefined): Point[] =>
    f ? recaler(f.points, start, end) : [start, end]

  /** The lines emitted, in the order the moving markers generate them. */
  const lines: Arrow[] = []

  const markers = from.markers.map((pion): Marker => {
    const homologue = vers.markers.find((q) => q.side === pion.side && q.position === pion.position)
    const end = homologue?.at ?? pion.at           // absent au temps suivant : il ne bouge pas
    const immobile = end.x === pion.at.x && end.y === pion.at.y
    const dessinee = flecheDe(pion.side, pion.position, TRAITS_DE_PION)
    // The line is computed even at the bounds: at `part` 0 nothing has moved yet, but
    // the path must already show — it announces the gesture, it does not comment on it
    // afterwards. A stationary marker gets none: it has no path.
    if (withPaths && !immobile) {
      lines.push({
        from: { side: pion.side, position: pion.position },
        points: chemin(pion.at, end, dessinee),
        // With no arrow drawn, the movement is a cut: that is the neutral stroke of
        // the playbook, and the toggle must light up *every* movement
        // — n'en montrer qu'une partie se lirait comme une panne.
        stroke: dessinee?.stroke ?? 'cut',
      })
    }
    // Immobile ou aux bornes : la valeur exacte du temps, sans interpolation qui ferait trembler.
    if (immobile || part <= 0) return { ...pion, at: { ...pion.at } }
    if (part >= 1) return { ...pion, at: { ...end } }
    return { ...pion, at: avanceSur(chemin(pion.at, end, dessinee), part) }
  })

  const ball = ((): Step['ball'] => {
    if (sameBall(from.ball, vers.ball)) return structuredClone(from.ball)
    const start = ballAt(from)
    const end = ballAt(vers)
    if (!start || !end) return structuredClone(from.ball)
    // In flight: neither carried nor resting where it was. A pass arrow from the carrier bends the path.
    const pass = 'x' in from.ball ? undefined : flecheDe(from.ball.side, from.ball.position, ['pass'])
    const vol = chemin(start, end, pass)
    // A pass is a movement like any other, and the coach shows it as much as the cuts:
    // it gets its line, dashed since that is its stroke.
    if (withPaths && 'x' in from.ball === false) {
      lines.push({ from: from.ball, points: vol, stroke: 'pass' })
    }
    if (part <= 0) return structuredClone(from.ball)
    if (part >= 1) return structuredClone(vers.ball)
    return avanceSur(vol, part)
  })()

  return { markers, ball, arrows: lines }
}
