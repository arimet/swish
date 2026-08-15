import { useId, type ReactNode } from 'react'
import { zoneSummary, type Shot } from '../../domain/shotchart'
import { zoneAt, ZONE_CENTROID, ZONE_LABELS, ZONES, type ShotZone } from '../../domain/shotzones'
import type { ShotSpot } from '../../domain/types'
import { C, T } from '../olive/kit'
import { useT } from '../../i18n'

// viewBox in centimetres, baseline at the top. See the plan's landmarks.
// Exported because the tactical board draws on the same half court — and, for the
// full court, on its mirror: one geometry for all.
/** Corner radius, in court units: 110 out of 1500 wide, roughly 7% — enough to be
 *  seen at any size, which a pixel radius is not. */
export const RAYON = 110

export const W = 1500
export const D = 1400

/**
 * The court's frame: inset 4 units from the viewBox and rounded by `RAYON`. One
 * definition, because three paths must coincide to the pixel — the drawn frame, its
 * full-court counterpart, and the zone clip. `h` is the depth: `D` for a half court,
 * twice that for a full one.
 */
export const cadre = (h = D) => ({ x: 4, y: 4, width: W - 8, height: h - 8, rx: RAYON })

/** Zone outlines, in the same order as ZONES. The arcs follow the three-point line. */
export const ZONE_PATH: Record<ShotZone, string> = {
  paint: 'M 505 0 H 995 V 580 H 505 Z',
  mid_left: 'M 90 0 H 505 V 786.5 A 675 675 0 0 1 90 299.01 Z',
  mid_center: 'M 505 580 H 995 V 786.5 A 675 675 0 0 1 505 786.5 Z',
  mid_right: 'M 1410 0 H 995 V 786.5 A 675 675 0 0 0 1410 299.01 Z',
  corner3_left: 'M 0 0 H 90 V 299.01 H 0 Z',
  corner3_right: 'M 1410 0 H 1500 V 299.01 H 1410 Z',
  top3: 'M 0 299.01 H 90 A 675 675 0 0 0 1410 299.01 H 1500 V 1400 H 0 Z',
}

/**
 * Regulation markings. Purely decorative: none of these shapes enters the zone
 * computation, which rests on `zoneAt` and `ZONE_PATH`.
 * Three stroke weights: the boundaries and the three-point line guide the eye, the
 * key and the free-throw circle come next, the rest recedes.
 */
export function CourtLines({ bord = true }: { bord?: boolean }) {
  // A court's lines are painted, not suggested. They were at 70%, 40% and 22%
  // opacity: even the main ones were ghosts, and that is what gave the board its
  // draft-like look rather than a court's. The main ones move to full opacity; the
  // secondary ones keep a step back, because a free-throw circle has no business
  // competing with the players for attention.
  const major = { fill: 'none', stroke: 'currentColor', strokeWidth: 9, opacity: 1 } as const
  const minor = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, opacity: 0.62 } as const
  const faint = { fill: 'none', stroke: 'currentColor', strokeWidth: 4, opacity: 0.34 } as const
  return (
    <g style={{ color: T.line }}>
      {/* The key **painted**, as in a gym. It was filled with the paths' ink at five
          per cent opacity, that is to say invisible: the court had no colour of its
          own, only markings laid on a bare slab. It was the surface that was missing,
          not the wood's hue. */}
      <rect x={505} y={0} width={490} height={580} fill={T.paint} />
      {/* Extensions of the lane lines: they hint at the mid-range targets. */}
      <g {...faint} strokeDasharray="18 22">
        <line x1={505} y1={580} x2={505} y2={786.5} />
        <line x1={995} y1={580} x2={995} y2={786.5} />
      </g>
      {/* Restricted area (1.25 m under the basket). */}
      <path d="M 625 157.5 A 125 125 0 0 0 875 157.5" {...faint} />
      {/* Free-throw circle: the half outside the key (towards half court) solid, the
          half overlapping the key dashed — the FIBA rule that the parts of the circle
          inside the restricted area are drawn dashed. Sweep 0 on both sides: checked
          by computation, a sweep of 1 swaps the two halves and bulges the solid stroke
          towards the basket. */}
      <path d="M 570 580 A 180 180 0 0 0 930 580" {...minor} />
      <path d="M 930 580 A 180 180 0 0 0 570 580" {...minor} strokeDasharray="30 26" />
      <rect x={505} y={0} width={490} height={580} {...minor} />
      {/* Backboard, then rim. */}
      <rect x={660} y={112} width={180} height={14} fill="currentColor" opacity={0.55} />
      <circle cx={750} cy={157.5} r={22.5} {...major} />
      {/* Three-point line and court boundaries. The frame is optional: put end to end
          with its mirror (full court), it would double the half-way line and plant two
          rounded corners on it — the caller then draws it itself. */}
      <path d="M 90 0 L 90 299.01 A 675 675 0 0 0 1410 299.01 L 1410 0" {...major} />
      {bord && <rect {...cadre()} {...major} />}
    </g>
  )
}

/**
 * Clips its children to the court's real shape. The `ZONE_PATH` outlines run to the
 * edge of the viewBox — `corner3_left` starts at (0,0) — whereas the court stops at
 * the frame, inset and rounded: without this clip, a zone's fill spills into the
 * corners the frame rounds off.
 */
function ClippedZones({ children }: { children: ReactNode }) {
  const id = `court-clip-${useId()}`
  return (
    <>
      <defs><clipPath id={id}><rect {...cadre()} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  )
}

function Court({ children, label, onClick }: { children: ReactNode; label: string; onClick?: (e: React.MouseEvent<SVGSVGElement>) => void }) {
  const gid = `court-${useId()}`
  return (
    <svg
      viewBox={`0 0 ${W} ${D}`}
      role={onClick ? 'application' : 'img'}
      aria-label={label}
      onClick={onClick}
      className={`w-full ${onClick ? 'cursor-crosshair' : ''}`}
      style={{ touchAction: 'manipulation' }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="10%" r="95%">
          <stop offset="0%" stopColor={T.courtHi} />
          <stop offset="100%" stopColor={T.court} />
        </radialGradient>
      </defs>
      {/* The background carries the rounding, not a CSS mask: a pixel radius does not
          follow the court's size and leaves the drawn frame, expressed in court units,
          overhanging or clipped. Here the two always coincide. */}
      <rect x={2} y={2} width={W - 4} height={D - 4} rx={RAYON} fill={`url(#${gid})`} />
      {children}
    </svg>
  )
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** How long the visual feedback stays after a tap, before the popup closes. */
export const SHOT_FEEDBACK_MS = 350

/** A short buzz where the browser supports it. iOS implements it in no browser: the
 *  visual feedback stays the main mechanism, the buzz is a bonus. */
function buzz(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15)
}

/**
 * The entry court, **controlled**: it is the caller that holds the last shot's
 * confirmation. While it stands, all input is neutralised — without that guard, a
 * second tap during the 350 ms of feedback would record a second shot.
 * The seven buttons under the court give the same result from the keyboard, to the
 * zone's precision.
 */
export function ShotPicker({ onPick, confirmation, shots }: {
  onPick: (spot: ShotSpot) => void
  confirmation?: { spot: ShotSpot; label: string; made: boolean } | null
  shots?: Shot[]
}) {
  const translate = useT()
  const locked = !!confirmation
  const commit = (spot: ShotSpot) => {
    if (locked) return
    buzz()
    onPick(spot)
  }
  const pickFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    if (locked) return
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    commit({ x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) })
  }
  return (
    <div>
      {/* The width is bounded, never the height: an SVG is a replaced element, so its
          box follows the viewBox's ratio as long as only its width is imposed. Bounding
          the height would centre it inside internal margins and
          `getBoundingClientRect` above would convert the finger crooked — a shot
          recorded next to the spot touched. Same trap as in `SchemaPlayer`.
          These 240px are enough to aim at a zone with a finger and keep the actions
          below (free throw, assist, block…) above the fold, at 1440×900 as much as at
          375×812. */}
      <div className="mx-auto w-full max-w-[240px]">
        <Court label={translate('tir.terrainSaisie')} onClick={pickFromEvent}>
          {shots?.map((s, i) => (
            <circle
              key={i}
              data-past-shot={s.made ? 'made' : 'missed'}
              cx={s.spot.x * W} cy={s.spot.y * D} r={11}
              fill={s.made ? T.attack : 'none'}
              stroke={s.made ? 'none' : T.line} strokeWidth={5}
              opacity={0.5}
            />
          ))}
          <CourtLines />
          {confirmation && <Confirmation spot={confirmation.spot} made={confirmation.made} />}
        </Court>
      </div>
      {/* Always rendered (empty content without a confirmation): the pill must never
          appear or disappear, otherwise everything after it — including the zone
          buttons and "+ 1 free throw" — shifts while the anti-double-count lock is
          still protecting them, opening a window where a second tap aims at a ghost
          target. */}
      <p role="status" className="mt-2 rounded-lg px-3 py-1.5 text-center text-[13px] font-black uppercase tracking-wide"
        style={{
          visibility: confirmation ? 'visible' : 'hidden',
          background: confirmation && !confirmation.made ? C.card2 : C.accentBg,
          color: confirmation && !confirmation.made ? C.muted : C.accent,
        }}>
        {confirmation?.label ?? ' '}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ZONES.map((z) => (
          <button
            key={z}
            disabled={locked}
            onClick={() => commit(ZONE_CENTROID[z])}
            className="rounded-lg px-2 py-1 text-[12px] font-semibold transition hover:brightness-125 disabled:opacity-40"
            style={{ background: C.card2, color: C.muted, border: `1px solid ${C.border}` }}
          >
            {translate(ZONE_LABELS[z])}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A recorded shot spot: the zone lights up, a filled dot, an expanding ring.
 * The same convention as past shots (`shots?.map` above): a filled disc for a made
 * shot, a hollow grey ring for a miss. Without it, the feedback's giant disc would
 * say "basket" even when the shot missed.
 */
function Confirmation({ spot, made }: { spot: ShotSpot; made: boolean }) {
  const cx = spot.x * W
  const cy = spot.y * D
  return (
    <g>
      <ClippedZones>
        <path d={ZONE_PATH[zoneAt(spot.x, spot.y)]} fill={made ? T.attack : T.line} fillOpacity={0.22} />
      </ClippedZones>
      <circle
        data-confirmation={made ? 'made' : 'missed'}
        cx={cx} cy={cy} r={26}
        fill={made ? T.attack : 'none'}
        stroke={made ? 'none' : T.attack} strokeWidth={made ? 0 : 10}
      />
      <circle cx={cx} cy={cy} r={26} fill="none" stroke={T.attack} strokeWidth={10}>
        <animate attributeName="r" from="26" to="160" dur={`${SHOT_FEEDBACK_MS}ms`} fill="freeze" />
        <animate attributeName="opacity" from="0.9" to="0" dur={`${SHOT_FEEDBACK_MS}ms`} fill="freeze" />
      </circle>
    </g>
  )
}

/**
 * Heat map. A zone stays neutral below `minAttempts` attempts: showing "100%" off a
 * single shot would give a false reading.
 */
export function ShotChart({ shots, minAttempts = 3 }: { shots: Shot[]; minAttempts?: number }) {
  const translate = useT()
  const sum = zoneSummary(shots)
  return (
    <Court label={translate('bord.carteDesTirs')}>
      <ClippedZones>
        {ZONES.map((z) => {
          const { made, attempts } = sum[z]
          const enough = attempts >= minAttempts
          const pct = attempts ? made / attempts : 0
          return (
            <path
              key={z}
              d={ZONE_PATH[z]}
              fill={enough ? T.attack : T.ink}
              fillOpacity={enough ? 0.1 + 0.55 * pct : 0.03}
            />
          )
        })}
      </ClippedZones>
      <CourtLines />
      {shots.map((s, i) => (
        <circle
          key={i}
          data-shot={s.made ? 'made' : 'missed'}
          cx={s.spot.x * W}
          cy={s.spot.y * D}
          r={14}
          fill={s.made ? T.attack : 'none'}
          stroke={s.made ? 'none' : T.line}
          strokeWidth={6}
        />
      ))}
      {ZONES.map((z) => {
        const { made, attempts } = sum[z]
        if (attempts < minAttempts) return null
        // The corners are too narrow (90 units) for a ratio centred at fontSize 62
        // bold (~175 units): even "10/10" spills out of the viewBox. Anchoring the
        // text to its edge rather than its centre always makes it grow towards the
        // inside of the court, whatever its length.
        const anchor = z === 'corner3_left' ? 'start' : z === 'corner3_right' ? 'end' : 'middle'
        return (
          <text
            key={z}
            x={ZONE_CENTROID[z].x * W}
            y={ZONE_CENTROID[z].y * D}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={62}
            fontWeight={900}
            fill={T.ink}
          >
            {made}/{attempts}
          </text>
        )
      })}
    </Court>
  )
}
