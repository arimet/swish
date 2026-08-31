/**
 * Rendering of the tactical board: a court (half or full), the props laid on it,
 * then one step of the play — arrows, markers, ball. Purely presentational: the
 * editor lays its gestures on top through the callbacks and `children`, it
 * redraws nothing.
 */
import type { ReactNode } from 'react'
import type { Arrow, Prop, Marker, Point, Play, Step } from '../../domain/plays'
import { T } from '../olive/kit'
import { useT } from '../../i18n'
import { cadre, clamp01, CourtLines, D, RAYON, W } from './ShotCourt'

/** The viewBox's depth: a full court is the half court and its mirror. */
const depth = (s: Play) => (s.court === 'full' ? D * 2 : D)

/**
 * The maximum width of a displayed court. Three bounds, and the smallest wins:
 *
 * — `100%`, the width actually available. It is the only one that never lies:
 *   without it, a 375px phone was handed a 422px court (52% of 812px of height),
 *   which overflowed the column and got clipped on the right. Screen height says
 *   nothing about a column's width.
 * — the vertical room we allow ourselves, in `vh`: a playbook diagram is read at a
 *   glance, and what usually limits it is height. Since width follows the court's
 *   ratio, we derive it from that height. A half court is 15/14, so 77vh of height
 *   is worth ~77vh of width; a full court is twice as deep, hence half as wide.
 * — a pixel ceiling, for very large screens where following the height would give a
 *   court over a metre across: past a certain size the eye scans instead of taking
 *   it in, and nothing is gained.
 *
 * It is the **width** that is bounded, never the height: the SVG's box must keep
 * exactly the viewBox's ratio, otherwise it centres itself inside margins and
 * `toSvg` converts gestures crooked.
 */
export const courtWidth = (court: Play['court'], place: 'lecture' | 'edition' = 'lecture') => {
  // Editing has more to fit under the court — toolbar, step strip — than reading,
  // which has only one row of controls. Hence two reserves.
  const vh = place === 'edition' ? 52 : 77
  const max = place === 'edition' ? 560 : 840
  const part = court === 'full' ? 2 : 1
  return `min(100%, ${vh / part}vh, ${max / part}px)`
}

/** Normalised coordinates → viewBox units (centimetres). */
const toUnits = (p: Point, h: number): Point => ({ x: p.x * W, y: p.y * h })

const n1 = (v: number) => v.toFixed(1)

/**
 * Screen → normalised coordinates, clamped to the court's bounds. The editor uses
 * it for every point of a gesture; hence the tolerance for an SVG not yet measured
 * (empty box), which would otherwise return NaN.
 */
export function toSvg(e: { clientX: number; clientY: number }, svg: SVGSVGElement): Point {
  const r = svg.getBoundingClientRect()
  if (!r.width || !r.height) return { x: 0, y: 0 }
  return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
}

/**
 * Catmull-Rom → cubic Bézier smoothing: the path goes through every sampled point
 * instead of cutting them. Two points: a straight segment, a straight gesture must
 * not bulge.
 */
function smooth(pts: Point[]): string {
  if (pts.length === 2) return `M ${n1(pts[0].x)} ${n1(pts[0].y)} L ${n1(pts[1].x)} ${n1(pts[1].y)}`
  let d = `M ${n1(pts[0].x)} ${n1(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? pts[i + 1]
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C ${n1(c1.x)} ${n1(c1.y)}, ${n1(c2.x)} ${n1(c2.y)}, ${n1(p2.x)} ${n1(p2.y)}`
  }
  return d
}

/**
 * The dribble stroke: a sine wave followed along the polyline, offset
 * perpendicular to the local direction. Sampling every `step` gives roughly ten
 * points per wave — enough for the eye to read a curve.
 */
function wavy(pts: Point[], amp = 26, lambda = 130, step = 13): string {
  const out: Point[] = []
  let travelled = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (!L) continue
    const ux = (b.x - a.x) / L
    const uy = (b.y - a.y) / L
    for (let t = 0; t < L; t += step) {
      const o = amp * Math.sin((2 * Math.PI * (travelled + t)) / lambda)
      out.push({ x: a.x + ux * t - uy * o, y: a.y + uy * t + ux * o })
    }
    travelled += L
  }
  // The exact last point: the arrowhead aligns on it.
  out.push(pts[pts.length - 1])
  return out.map((p, i) => `${i ? 'L' : 'M'} ${n1(p.x)} ${n1(p.y)}`).join(' ')
}

/** Arrowhead: two open segments, ~33° either side of the path. */
function head(a: Point, b: Point, size = 54): string {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const arm = (d: number) => `${n1(b.x + size * Math.cos(ang + d))} ${n1(b.y + size * Math.sin(ang + d))}`
  return `M ${arm(Math.PI * 0.815)} L ${n1(b.x)} ${n1(b.y)} L ${arm(-Math.PI * 0.815)}`
}

/**
 * The screen: a T-bar perpendicular to the last segment, in place of the head.
 * That is the notebook's convention — a head here would read as "cut".
 */
function tBar(a: Point, b: Point, half = 58): string {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = (-(b.y - a.y) / L) * half
  const ny = ((b.x - a.x) / L) * half
  return `M ${n1(b.x - nx)} ${n1(b.y - ny)} L ${n1(b.x + nx)} ${n1(b.y + ny)}`
}

/**
 * What putting the two halves end to end does not give: the full court's frame in
 * one piece, the half-way line (a single one) and the centre circle. The two
 * `CourtLines` are therefore rendered without frames of their own.
 */
function Midcourt() {
  const stroke = { fill: 'none', stroke: T.line, strokeWidth: 9, opacity: 0.7 } as const
  return (
    <g>
      <line x1={4} y1={D} x2={W - 4} y2={D} {...stroke} />
      <circle cx={W / 2} cy={D} r={180} {...stroke} strokeWidth={6} opacity={0.4} />
      <rect {...cadre(D * 2)} {...stroke} />
    </g>
  )
}

/** The coach's notebook's four strokes, told apart by shape alone. */
function DrawnArrow({ f, h }: { f: Arrow; h: number }) {
  const pts = f.points.map((p) => toUnits(p, h))
  if (pts.length < 2) return null
  const a = pts[pts.length - 2]
  const b = pts[pts.length - 1]
  return (
    <g data-stroke={f.stroke} fill="none" stroke={T.ink} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round">
      <path
        d={f.stroke === 'dribble' ? wavy(pts) : smooth(pts)}
        strokeDasharray={f.stroke === 'pass' ? '38 30' : undefined}
      />
      <path d={f.stroke === 'screen' ? tBar(a, b) : head(a, b)} />
    </g>
  )
}

/**
 * Offense: a filled disc in the attack colour, the number on top. Defence: an open
 * ring with the number inside it.
 *
 * The defender is drawn, not written: a grey text cross drowns in the court's lines,
 * especially in a thumbnail. Drawn, it carries the same stroke weight as the disc, so
 * both sides read at a glance and are told apart by **shape** — filled disc against
 * open ring — hence in black and white too. The opaque fill detaches the marker from
 * the court's lines.
 */
function DrawnMarker({ marker, h }: { marker: Marker; h: number }) {
  const { x, y } = toUnits(marker.at, h)
  const common = { textAnchor: 'middle', dominantBaseline: 'central', fontWeight: 900 } as const
  if (marker.side === 'defense') {
    // The same footprint as an attacker, and a single glyph: the cross set beside
    // its digit spread over twice a disc's width and read as two things. Here the
    // number is where the eye looks for it, at the centre of the marker.
    return (
      <g data-marker="defense">
        <circle cx={x} cy={y} r={54} fill={T.court} stroke={T.def} strokeWidth={13} />
        <text x={x} y={y} {...common} fontSize={62} fill={T.def}>{String(marker.position)}</text>
      </g>
    )
  }
  return (
    <g data-marker="offense">
      <circle cx={x} cy={y} r={54} fill={T.attack} />
      {/* `onAttack` and not `ink`: the ink of the paths and the number written on
          the disc are two roles, and `ink` held both. When the court turned to light
          hardwood, `ink` went dark for the paths — and the number ended up black on
          red, at 2.4:1. */}
      <text x={x} y={y} {...common} fontSize={62} fill={T.onAttack}>{String(marker.position)}</text>
    </g>
  )
}

/** The ball: on the marker carrying it (offset so as not to hide their number), or
 *  on the floor. Amber and not the attack colour: sitting on an attacker, it would
 *  disappear. */
function Ball({ t, h }: { t: Step; h: number }) {
  const translate = useT()
  const b = t.ball
  let at: Point | null = null
  if ('x' in b) at = toUnits(b, h)
  else {
    const carrier = t.markers.find((p) => p.side === b.side && p.position === b.position)
    if (carrier) {
      const u = toUnits(carrier.at, h)
      at = { x: u.x + 48, y: u.y - 48 }
    }
  }
  if (!at) return null
  return <circle aria-label={translate('play.ball')} cx={at.x} cy={at.y} r={28} fill={T.ball} stroke={T.court} strokeWidth={6} />
}

/**
 * A freehand annotation: the coach's pen.
 *
 * Deliberately thinner than an arrow and without a head — it must read as writing on
 * the board, not as a movement. A stroke that looked like an arrow would have the
 * reader hunting for the player it carries.
 */
function DrawnBrush({ line, h }: { line: Point[]; h: number }) {
  const pts = line.map((p) => toUnits(p, h))
  if (pts.length < 2) return null
  return (
    <path
      data-brush="" d={smooth(pts)} fill="none" stroke={T.ink} strokeWidth={7}
      strokeLinecap="round" strokeLinejoin="round" opacity={0.75}
    />
  )
}

/** Cone, loose ball, agility ladder: the drill's equipment, shared by every step. */
function DrawnProp({ o, h }: { o: Prop; h: number }) {
  const { x, y } = toUnits(o.at, h)
  return (
    <g data-prop={o.kind} transform={`translate(${n1(x)} ${n1(y)})`} fill="none" stroke={T.ball} strokeWidth={8} opacity={0.9}>
      {o.kind === 'cone' && <path d="M 0 -34 L 27 30 H -27 Z" fill={T.ball} stroke="none" />}
      {o.kind === 'ball' && (
        <>
          <circle r={26} />
          <path d="M -26 0 H 26 M 0 -26 A 32 32 0 0 0 0 26 M 0 -26 A 32 32 0 0 1 0 26" />
        </>
      )}
      {o.kind === 'ladder' && <path d="M -30 -46 V 46 M 30 -46 V 46 M -30 -23 H 30 M -30 0 H 30 M -30 23 H 30" />}
    </g>
  )
}

/**
 * The board. `stepIndex` picks the step shown; out of bounds, we fall back to the
 * first — a play always has at least one step, and a thumbnail must never render an
 * empty court. `preview` cuts all interaction (thumbnails).
 */
export function PlayBoard({ play, stepIndex, step, onPointerDown, onPointerMove, onPointerUp, children, preview, fills }: {
  play: Play
  stepIndex: number
  /** A computed step — the player's snapshot — to display instead of the play's own.
   *  The rendering does not change: an animation is only a sequence of states. */
  step?: Step
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void
  children?: ReactNode
  preview?: boolean
  /** The SVG fills its box instead of following its width. Reserved for the player,
   *  which sets the court's ratio itself: a caller that converts pointer coordinates
   *  must not use it. */
  fills?: boolean
}) {
  const translate = useT()
  const h = depth(play)
  const t = step ?? play.steps[stepIndex] ?? play.steps[0]
  const interactive = !preview && !!(onPointerDown || onPointerMove || onPointerUp)
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      role={interactive ? 'application' : 'img'}
      aria-label={translate('play.board', { name: play.name })}
      onPointerDown={preview ? undefined : onPointerDown}
      onPointerMove={preview ? undefined : onPointerMove}
      onPointerUp={preview ? undefined : onPointerUp}
      className={`${fills ? 'h-full w-full' : 'w-full'} ${interactive ? 'cursor-crosshair' : ''}`}
      style={{ touchAction: interactive ? 'none' : 'manipulation' }}
    >
      {/* The background carries the rounding, not a CSS mask: expressed in court
          units, it follows the board's size and always coincides with the drawn
          frame. */}
      <rect x={2} y={2} width={W - 4} height={h - 4} rx={RAYON} fill={T.court} />
      <CourtLines bord={play.court === 'half'} />
      {play.court === 'full' && (
        <>
          <g transform={`translate(0 ${D * 2}) scale(1 -1)`}>
            <CourtLines bord={false} />
          </g>
          <Midcourt />
        </>
      )}
      {play.props.map((o, i) => <DrawnProp key={i} o={o} h={h} />)}
      {/* Annotations under everything: they comment on the play, they are not it. */}
      {(t.brush ?? []).map((line, i) => <DrawnBrush key={i} line={line} h={h} />)}
      {/* Arrows next: a marker must never be struck through by a stroke. */}
      {t.arrows.map((f, i) => <DrawnArrow key={i} f={f} h={h} />)}
      {t.markers.map((p) => <DrawnMarker key={`${p.side}${p.position}`} marker={p} h={h} />)}
      <Ball t={t} h={h} />
      {children}
    </svg>
  )
}
