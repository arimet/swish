import type { ReactNode } from 'react'
import { zoneSummary, type Shot } from '../../domain/shotchart'
import { ZONE_CENTROID, ZONE_LABELS, ZONES, type ShotZone } from '../../domain/shotzones'
import type { ShotSpot } from '../../domain/types'
import { C } from '../olive/kit'

// viewBox en centimètres, ligne de fond en haut. Voir les repères du plan.
const W = 1500
const D = 1400

/** Contours des zones, dans le même ordre que ZONES. Les arcs suivent la ligne à 3 points. */
const ZONE_PATH: Record<ShotZone, string> = {
  paint: 'M 505 0 H 995 V 580 H 505 Z',
  mid_left: 'M 90 0 H 505 V 786.5 A 675 675 0 0 1 90 299.01 Z',
  mid_center: 'M 505 580 H 995 V 786.5 A 675 675 0 0 1 505 786.5 Z',
  mid_right: 'M 1410 0 H 995 V 786.5 A 675 675 0 0 0 1410 299.01 Z',
  corner3_left: 'M 0 0 H 90 V 299.01 H 0 Z',
  corner3_right: 'M 1410 0 H 1500 V 299.01 H 1410 Z',
  top3: 'M 0 299.01 H 90 A 675 675 0 0 0 1410 299.01 H 1500 V 1400 H 0 Z',
}

/** Tracés réglementaires, sans interaction ni données. */
function CourtLines() {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 8, opacity: 0.45 } as const
  return (
    <g style={{ color: C.muted }}>
      <rect x={4} y={4} width={W - 8} height={D - 8} rx={12} {...line} />
      <rect x={505} y={0} width={490} height={580} {...line} />
      <circle cx={750} cy={580} r={180} {...line} />
      <line x1={660} y1={120} x2={840} y2={120} {...line} />
      <circle cx={750} cy={157.5} r={22.5} {...line} />
      <path d="M 90 0 L 90 299.01 A 675 675 0 0 0 1410 299.01 L 1410 0" {...line} />
    </g>
  )
}

function Court({ children, label, onClick }: { children: ReactNode; label: string; onClick?: (e: React.MouseEvent<SVGSVGElement>) => void }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${D}`}
      role={onClick ? 'application' : 'img'}
      aria-label={label}
      onClick={onClick}
      className={`w-full rounded-2xl ${onClick ? 'cursor-crosshair' : ''}`}
      style={{ background: C.panel, border: `1px solid ${C.border}`, touchAction: 'manipulation' }}
    >
      {children}
    </svg>
  )
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Terrain de saisie. Le clic est converti en coordonnées normalisées à partir de
 * la boîte rendue, donc indépendamment de la taille d'affichage.
 * Les sept boutons sous le terrain donnent le même résultat au clavier, à la
 * précision de la zone près.
 */
export function ShotPicker({ onPick }: { onPick: (spot: ShotSpot) => void }) {
  const pickFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    onPick({ x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) })
  }
  return (
    <div>
      <Court label="Demi-terrain — toucher le point de tir" onClick={pickFromEvent}>
        <CourtLines />
      </Court>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ZONES.map((z) => (
          <button
            key={z}
            onClick={() => onPick(ZONE_CENTROID[z])}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:brightness-125"
            style={{ background: C.card2, color: C.muted, border: `1px solid ${C.border}` }}
          >
            {ZONE_LABELS[z]}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Carte de chaleur. Une zone reste neutre sous `minAttempts` tentatives :
 * afficher « 100 % » sur un seul tir donnerait une lecture fausse.
 */
export function ShotChart({ shots, minAttempts = 3 }: { shots: Shot[]; minAttempts?: number }) {
  const sum = zoneSummary(shots)
  return (
    <Court label="Carte des tirs">
      {ZONES.map((z) => {
        const { made, attempts } = sum[z]
        const enough = attempts >= minAttempts
        const pct = attempts ? made / attempts : 0
        return (
          <path
            key={z}
            d={ZONE_PATH[z]}
            fill={enough ? C.accent : C.text}
            fillOpacity={enough ? 0.1 + 0.55 * pct : 0.03}
          />
        )
      })}
      <CourtLines />
      {shots.map((s, i) => (
        <circle
          key={i}
          data-shot={s.made ? 'made' : 'missed'}
          cx={s.spot.x * W}
          cy={s.spot.y * D}
          r={14}
          fill={s.made ? C.accent : 'none'}
          stroke={s.made ? 'none' : C.muted}
          strokeWidth={6}
        />
      ))}
      {ZONES.map((z) => {
        const { made, attempts } = sum[z]
        if (attempts < minAttempts) return null
        return (
          <text
            key={z}
            x={ZONE_CENTROID[z].x * W}
            y={ZONE_CENTROID[z].y * D}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={62}
            fontWeight={900}
            fill={C.text}
          >
            {made}/{attempts}
          </text>
        )
      })}
    </Court>
  )
}
