/**
 * The tactical board's domain: a play is a sequence of steps, and each step carries
 * the complete positions of the markers, the ball and its arrows.
 * Coordinates normalised 0..1 within the chosen court: on `half`, y runs from the
 * baseline (0) to the half-way line (1); on `full`, half-way sits at 0.5 and the front
 * court is y ≤ 0.5.
 */
export type Court = 'half' | 'full'
export type Side = 'offense' | 'defense'
export type Position = 1 | 2 | 3 | 4 | 5
export type Stroke = 'cut' | 'screen' | 'pass' | 'dribble'

export interface Point { x: number; y: number }

export interface Marker { side: Side; position: Position; at: Point }

/** Sampled points of the gesture, smoothed at render time. The last one carries the
 *  arrowhead (or the T-bar for a screen). */
export interface Arrow { from: { side: Side; position: Position }; points: Point[]; stroke: Stroke }

export interface Step {
  markers: Marker[]                                   // 5 ou 10 selon `defense`
  ball: { side: Side; position: Position } | Point    // porté par un pion, ou posé au sol
  arrows: Arrow[]
}

export interface Prop { kind: 'cone' | 'ball' | 'ladder'; at: Point }

export interface Play {
  id: string
  clubId: string
  name: string
  note?: string
  court: Court
  defense: boolean
  props: Prop[]                             // communs à tous les temps
  steps: Step[]                                  // au moins un
  /** Étiquette de rangement. Absent = « Sans dossier ». Un seul niveau : la liste
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
  const noms = new Set(plays.map((s) => s.folder?.trim()).filter((d): d is string => !!d))
  return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
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
 * The following step: same positions, same ball, no arrows. The coach drags the
 * markers where his arrows were sending them — he does not replace five markers at
 * every step.
 */
export function nextStep(t: Step): Step {
  return { markers: structuredClone(t.markers), ball: structuredClone(t.ball), arrows: [] }
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
  }
  const noms: Record<Prop['kind'], string> = { cone: 'play.occCone', ball: 'play.occLooseBall', ladder: 'play.occLadder' }
  for (const o of s.props) if (o.at.y > 0.5) return { key: noms[o.kind] }
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
