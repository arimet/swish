/**
 * The tactical board's domain: a play is a sequence of steps, and each step carries
 * the complete positions of the markers, the ball and its arrows.
 * Coordinates normalised 0..1 within the chosen court: on `half`, y runs from the
 * baseline (0) to the half-way line (1); on `full`, half-way sits at 0.5 and the front
 * court is y ≤ 0.5.
 */
export type Court = 'half' | 'full'
export type Side = 'offense' | 'defense'
/**
 * A player's number on the board, and their identity: arrows and the ball name a
 * marker by `(side, position)`.
 *
 * Five per side, no more: that is the game, and the type says so rather than leaving
 * it to be checked. Players can be added and removed one at a time — a three-on-two,
 * a two-on-one — so a side may hold fewer than five, and the numbers left may have
 * gaps while it does. A **freed number is reused**: remove 3, place a player, and they
 * come back as 3. Handing out a sixth would name a poste that does not exist.
 */
export type Position = 1 | 2 | 3 | 4 | 5

/** Five per side. Not a setting: it is the game. */
export const MAX_PER_SIDE = 5
export type Stroke = 'cut' | 'screen' | 'pass' | 'dribble'

export interface Point { x: number; y: number }

export interface Marker { side: Side; position: Position; at: Point }

/**
 * A player's path: two points, from the marker it leaves to where it ends.
 *
 * `points` is a list and not a pair: the editor offers a straight path and a freehand
 * one (see `PlayEdit`'s shape control), and a freehand gesture keeps its sampled
 * points. `anim.refit` bends whatever it is given onto the two steps' positions, so
 * both shapes animate the same way. The last point carries the arrowhead (or the T-bar
 * for a screen).
 */
export interface Arrow { from: { side: Side; position: Position }; points: Point[]; stroke: Stroke }

export interface Step {
  markers: Marker[]
  ball: { side: Side; position: Position } | Point    // carried by a marker, or on the floor
  arrows: Arrow[]
  /**
   * Freehand annotations, one list of points per stroke.
   *
   * They belong to no player and move nothing: a zone circled, a cross on a spot, a
   * word underlined. That is exactly why they are not `Arrow`s — an `Arrow` names the
   * marker it carries, and the animation makes that marker travel along it.
   */
  brush?: Point[][]
}

export interface Prop { kind: 'cone' | 'ball' | 'ladder'; at: Point }

export interface Play {
  id: string
  clubId: string
  name: string
  note?: string
  court: Court
  defense: boolean
  props: Prop[]                             // shared by every step
  steps: Step[]                                  // at least one
  /** A filing label. Absent = "Unfiled". One level only: the list
   *  of folders is derived from the plays; there is no table and no entity. */
  folder?: string
  /** ISO date of the last save, written by the persistence layer. Orders the library
   *  from most to least recent. Absent on plays saved before we timestamped them. */
  updatedAt?: string
}

/** The folders these plays declare: distinct non-empty values, sorted the French way
 *  ("Écran" before "Remise"). A folder emptied of its plays disappears on its own,
 *  since nothing stores it anywhere else. */
export function folders(plays: Play[]): string[] {
  const names = new Set(plays.map((s) => s.folder?.trim()).filter((d): d is string => !!d))
  return [...names].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** The basket's normalised position, per court (1.575 m from the baseline). */
export const BASKET: Record<Court, Point[]> = {
  half: [{ x: 0.5, y: 1.575 / 14 }],
  full: [{ x: 0.5, y: 1.575 / 28 }, { x: 0.5, y: 1 - 1.575 / 28 }],
}

// A 1-2-2 on the half court: point guard at the top of the key, two wings, two posts.
const SETUP: Record<Position, Point> = {
  1: { x: 0.5, y: 0.62 }, 2: { x: 0.22, y: 0.48 }, 3: { x: 0.78, y: 0.48 },
  4: { x: 0.3, y: 0.2 }, 5: { x: 0.7, y: 0.2 },
}

const POSITIONS: Position[] = [1, 2, 3, 4, 5]

/**
 * A blank play: the 1-2-2 offense, a mirrored defense if asked for (each defender
 * halfway along the attacker-to-basket segment), the ball with the point guard. On a
 * full court the setup occupies the front half. The `id` is left to persistence.
 */
export const DEFAULT_PLAY_NAME = 'play.newName'

export function newPlay(clubId: string, court: Court, defense: boolean): Omit<Play, 'id'> {
  const basket = BASKET[court][0]
  const offense: Marker[] = POSITIONS.map((position) => {
    const base = SETUP[position]
    return { side: 'offense', position, at: { x: base.x, y: court === 'full' ? base.y / 2 : base.y } }
  })
  const markers = defense
    ? [...offense, ...offense.map((a): Marker => ({
        side: 'defense',
        position: a.position,
        at: { x: (a.at.x + basket.x) / 2, y: (a.at.y + basket.y) / 2 },
      }))]
    : offense
  return {
    clubId,
    name: DEFAULT_PLAY_NAME,
    court,
    defense,
    props: [],
    steps: [{ markers, ball: { side: 'offense', position: 1 }, arrows: [] }],
  }
}

/**
 * The following step: same positions, no arrows and no annotations. The coach drags
 * the markers where his arrows were sending them — he does not replace five markers
 * at every step.
 *
 * **The ball follows the pass.** A pass drawn from the carrier to a teammate says who
 * has it next; making the coach then place the ball by hand was asking them to state
 * twice what they had already drawn once, and the step where they forgot showed the
 * ball still in the passer's hands.
 */
export function nextStep(t: Step): Step {
  return {
    markers: structuredClone(t.markers),
    ball: receiver(t) ?? structuredClone(t.ball),
    arrows: [],
  }
}

/**
 * How close a gesture has to end to a marker for the two to be treated as touching.
 *
 * One radius, two uses, and they have to agree: the editor snaps an arrow's end onto
 * the marker, and `receiver` below reads that end back to find who catches the pass.
 * Two different tolerances would let a coach draw a pass that visibly lands on 2 and
 * hands the ball to nobody.
 */
export const SNAP_RADIUS = 0.06

/** The marker within `SNAP_RADIUS` of `p`, nearest first, `null` if none is close
 *  enough. `except` leaves out the marker a gesture started from — an arrow ending on
 *  its own author is a zero-length stroke, not a pass to oneself. */
export function markerNear(
  t: Step, p: Point, except?: { side: Side; position: Position },
): Marker | null {
  let found: Marker | null = null
  for (const m of t.markers) {
    if (except && m.side === except.side && m.position === except.position) continue
    const d = Math.hypot(m.at.x - p.x, m.at.y - p.y)
    if (d > SNAP_RADIUS) continue
    if (!found || d < Math.hypot(found.at.x - p.x, found.at.y - p.y)) found = m
  }
  return found
}

/**
 * Who catches the ball in this step, if anyone: the marker at the end of a pass drawn
 * **from the current carrier**.
 *
 * That the pass must start from the carrier is the whole precision of the rule. A
 * pass drawn between two other players is a drawing — a second option, a reminder —
 * and must not move a ball that was never in that hand. The last such pass wins: the
 * coach who redraws is correcting, not adding.
 */
export function receiver(t: Step): { side: Side; position: Position } | null {
  if ('x' in t.ball) return null                 // on the floor: nobody is passing it
  const carrier = t.ball
  for (let i = t.arrows.length - 1; i >= 0; i--) {
    const a = t.arrows[i]
    if (a.stroke !== 'pass') continue
    if (a.from.side !== carrier.side || a.from.position !== carrier.position) continue
    const end = a.points[a.points.length - 1]
    const target = end && markerNear(t, end, carrier)
    if (target) return { side: target.side, position: target.position }
  }
  return null
}

const POSITIONS_ALL: Position[] = [1, 2, 3, 4, 5]

/**
 * The lowest number free on that side, `null` when all five are taken.
 *
 * **Lowest, not next**: a side that has lost its 3 gets its 3 back, not a 6. The
 * board reads as a team of five whatever the coach has added and removed, and a
 * number always names a poste that exists.
 *
 * A number taken in **any** step counts as taken. A play carries the same set of
 * markers at every step (see `addPlayer`), so the question does not normally arise —
 * but reusing a number that still exists three steps later would merge two players
 * into one, and every arrow naming that number would become ambiguous.
 */
export function freePosition(s: Play, side: Side): Position | null {
  const taken = new Set(s.steps.flatMap((t) => t.markers.filter((m) => m.side === side).map((m) => m.position)))
  return POSITIONS_ALL.find((n) => !taken.has(n)) ?? null
}

/**
 * Adds a player, at the same spot in **every** step. Returns the play unchanged when
 * that side already holds its five.
 *
 * Every step carries the complete set of markers, so a player who exists in one step
 * and not the next has no counterpart to travel towards — `anim.snapshot` leaves them
 * where they are, and the coach sees a marker that ignores the play. The coach then
 * drags them step by step, which is the ordinary gesture.
 *
 * The full side is refused **here** and not only in the interface: the editor greys
 * the control out, and this is what makes the limit true whatever calls it.
 */
export function addPlayer(s: Play, side: Side, at: Point): Play {
  const position = freePosition(s, side)
  if (position === null) return s
  const marker: Marker = { side, position, at }
  return {
    ...s,
    // A play carries defenders or it does not, and that flag is what the "Defence"
    // toggle reads. Placing the first opponent turns it on rather than leaving the
    // board showing a defender the play claims not to have.
    defense: side === 'defense' ? true : s.defense,
    steps: s.steps.map((t) => ({ ...t, markers: [...t.markers, structuredClone(marker)] })),
  }
}

/**
 * Removes a player from every step, with what named them: their arrows go, and the
 * ball drops to the floor where they stood if they were carrying it.
 *
 * The ball is deliberately **not** handed to a teammate. Choosing one would be
 * inventing a pass the coach never drew; on the floor it is visible, wrong in a way
 * anyone can see, and one tap from being right.
 *
 * The last attacker cannot be removed: a play with nobody to carry the ball is a
 * state no screen can draw.
 */
export function removePlayer(s: Play, side: Side, position: Position): Play {
  const isTarget = (m: { side: Side; position: Position }) => m.side === side && m.position === position
  if (side === 'offense' && s.steps.every((t) => t.markers.filter((m) => m.side === 'offense').length <= 1)) return s

  const steps = s.steps.map((t): Step => {
    const gone = t.markers.find(isTarget)
    return {
      ...t,
      markers: t.markers.filter((m) => !isTarget(m)),
      arrows: t.arrows.filter((a) => !isTarget(a.from)),
      ball: !('x' in t.ball) && isTarget(t.ball) ? { ...(gone?.at ?? { x: 0.5, y: 0.5 }) } : t.ball,
    }
  })
  return {
    ...s,
    defense: steps.some((t) => t.markers.some((m) => m.side === 'defense')),
    steps,
  }
}

/** Distance from `p` to segment [a, b], at the nearest point. Exported because the
 *  editor's eraser finds the arrow under the finger with the same measure. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Reduces a sampled gesture to its salient points without losing its shape
 * (Ramer-Douglas-Peucker): an L-shaped stroke keeps its corner. The threshold is in
 * normalised units; below three points the stroke is returned as is.
 */
export function simplifyPath(points: Point[], epsilon = 0.01): Point[] {
  if (points.length < 3) return points
  const start = points[0]
  const fin = points[points.length - 1]
  let distMax = 0
  let iMax = 0
  for (let i = 1; i < points.length - 1; i++) {
    const dist = distanceToSegment(points[i], start, fin)
    if (dist > distMax) { distMax = dist; iMax = i }
  }
  if (distMax <= epsilon) return [start, fin]
  return [
    ...simplifyPath(points.slice(0, iMax + 1), epsilon).slice(0, -1),
    ...simplifyPath(points.slice(iMax), epsilon),
  ]
}

/** A copy of the play on the given court, with every y passed through `f`. */
function remapY(s: Play, court: Court, f: (y: number) => number): Play {
  const pt = (p: Point): Point => ({ x: p.x, y: f(p.y) })
  return {
    ...s,
    court,
    props: s.props.map((o) => ({ ...o, at: pt(o.at) })),
    steps: s.steps.map((t) => ({
      markers: t.markers.map((p) => ({ ...p, at: pt(p.at) })),
      ball: 'x' in t.ball ? pt(t.ball) : { ...t.ball },
      arrows: t.arrows.map((fl) => ({ ...fl, points: fl.points.map(pt) })),
      // Without this the annotations would stay in the old scale: a circle drawn round
      // the key would end up across the half-way line.
      ...(t.brush ? { brush: t.brush.map((line) => line.map(pt)) } : {}),
    })),
  }
}

/** What occupies the back court (y > 0.5), named by a translation key and the position
 *  number when there is one. The domain names, the interface writes. */
export interface Occupant { key: string; n?: number }

function backcourtOccupant(s: Play): Occupant | null {
  for (const t of s.steps) {
    for (const p of t.markers) if (p.at.y > 0.5) return { key: 'play.occPosition', n: p.position }
    for (const fl of t.arrows) if (fl.points.some((p) => p.y > 0.5)) return { key: 'play.occArrow', n: fl.from.position }
    for (const line of t.brush ?? []) if (line.some((p) => p.y > 0.5)) return { key: 'play.occBrush' }
  }
  const names: Record<Prop['kind'], string> = { cone: 'play.occCone', ball: 'play.occLooseBall', ladder: 'play.occLadder' }
  for (const o of s.props) if (o.at.y > 0.5) return { key: names[o.kind] }
  for (const t of s.steps) if ('x' in t.ball && t.ball.y > 0.5) return { key: 'play.occBall' }
  return null
}

/**
 * Changes a play's court. half → full remaps into the front court, losing nothing;
 * full → half is refused while a marker, an arrow, a prop or the loose ball occupies
 * the back court — remapping in silence would lose half the drawing.
 */
export function toCourt(s: Play, court: Court): { ok: Play } | { refused: Occupant } {
  if (s.court === court) return { ok: s }
  if (court === 'full') return { ok: remapY(s, court, (y) => y / 2) }
  const occupant = backcourtOccupant(s)
  if (occupant) return { refused: occupant }
  return { ok: remapY(s, court, (y) => y * 2) }
}
