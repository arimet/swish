import { useId, type ReactNode } from 'react'
import { zoneSummary, type Shot } from '../../domain/shotchart'
import { zoneAt, ZONE_CENTROID, ZONE_LABELS, ZONES, type ShotZone } from '../../domain/shotzones'
import type { ShotSpot } from '../../domain/types'
import { C } from '../olive/kit'

// viewBox en centimètres, ligne de fond en haut. Voir les repères du plan.
// Exportés parce que le tableau tactique dessine sur le même demi-terrain — et,
// pour le terrain complet, sur son miroir : une seule géométrie pour tous.
export const W = 1500
export const D = 1400

/** Contours des zones, dans le même ordre que ZONES. Les arcs suivent la ligne à 3 points. */
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
 * Tracés réglementaires. Purement décoratif : aucune de ces formes n'entre dans le
 * calcul des zones, qui repose sur `zoneAt` et `ZONE_PATH`.
 * Trois poids de trait : les limites et la ligne à 3 points guident le regard, la
 * raquette et le cercle de lancer franc viennent ensuite, le reste s'efface.
 */
export function CourtLines({ bord = true }: { bord?: boolean }) {
  const major = { fill: 'none', stroke: 'currentColor', strokeWidth: 9, opacity: 0.7 } as const
  const minor = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, opacity: 0.4 } as const
  const faint = { fill: 'none', stroke: 'currentColor', strokeWidth: 4, opacity: 0.22 } as const
  return (
    <g style={{ color: C.muted }}>
      {/* Fond propre à la raquette */}
      <rect x={505} y={0} width={490} height={580} fill={C.text} fillOpacity={0.05} />
      {/* Prolongements des lignes de raquette : laissent deviner les cibles de mi-distance */}
      <g {...faint} strokeDasharray="18 22">
        <line x1={505} y1={580} x2={505} y2={786.5} />
        <line x1={995} y1={580} x2={995} y2={786.5} />
      </g>
      {/* Zone restrictive (1,25 m sous le panier) */}
      <path d="M 625 157.5 A 125 125 0 0 0 875 157.5" {...faint} />
      {/* Cercle de lancer franc : la moitié hors-raquette (côté milieu de terrain) en
          trait plein, la moitié qui chevauche la raquette en pointillés — règle FIBA
          « les parties du cercle situées dans la raquette sont tracées en pointillés ».
          Balayage à 0 des deux côtés : vérifié par calcul, un balayage à 1 inverse les
          deux moitiés et fait bomber le trait plein vers le panier. */}
      <path d="M 570 580 A 180 180 0 0 0 930 580" {...minor} />
      <path d="M 930 580 A 180 180 0 0 0 570 580" {...minor} strokeDasharray="30 26" />
      <rect x={505} y={0} width={490} height={580} {...minor} />
      {/* Panneau puis arceau */}
      <rect x={660} y={112} width={180} height={14} fill="currentColor" opacity={0.55} />
      <circle cx={750} cy={157.5} r={22.5} {...major} />
      {/* Ligne à 3 points et limites du terrain. Le cadre est optionnel : mis bout
          à bout avec son miroir (terrain complet), il doublerait la ligne médiane
          et y planterait deux coins arrondis — l'appelant le trace alors lui-même. */}
      <path d="M 90 0 L 90 299.01 A 675 675 0 0 0 1410 299.01 L 1410 0" {...major} />
      {bord && <rect x={4} y={4} width={W - 8} height={D - 8} rx={12} {...major} />}
    </g>
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
      className={`w-full rounded-2xl ${onClick ? 'cursor-crosshair' : ''}`}
      style={{ border: `1px solid ${C.border}`, touchAction: 'manipulation' }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="10%" r="95%">
          <stop offset="0%" stopColor={C.card2} />
          <stop offset="100%" stopColor={C.panel} />
        </radialGradient>
      </defs>
      <rect width={W} height={D} fill={`url(#${gid})`} />
      {children}
    </svg>
  )
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Durée d'affichage du retour visuel après un tap, avant fermeture de la popup. */
export const SHOT_FEEDBACK_MS = 350

/** Vibration courte là où le navigateur la supporte. iOS ne l'implémente sur aucun
 *  navigateur : le retour visuel reste le mécanisme principal, la vibration un bonus. */
function buzz(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15)
}

/**
 * Terrain de saisie, **contrôlé** : c'est l'appelant qui détient la confirmation du
 * dernier tir. Tant qu'elle est posée, toute saisie est neutralisée — sans ce garde,
 * un second tap pendant les 350 ms d'affichage enregistrerait un second tir.
 * Les sept boutons sous le terrain donnent le même résultat au clavier, à la
 * précision de la zone près.
 */
export function ShotPicker({ onPick, confirmation, shots }: {
  onPick: (spot: ShotSpot) => void
  confirmation?: { spot: ShotSpot; label: string; made: boolean } | null
  shots?: Shot[]
}) {
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
      {/* La largeur est bornée, jamais la hauteur : le SVG est un élément remplacé,
          sa boîte suit donc le rapport du viewBox tant qu'on ne lui impose que sa
          largeur. Borner la hauteur le centrerait dans des marges internes et
          `getBoundingClientRect` ci-dessus convertirait le doigt de travers — un tir
          enregistré à côté de l'endroit touché. Même piège que dans `SchemaPlayer`.
          Ces 240 px suffisent à viser une zone au doigt et laissent les actions du bas
          (lancer franc, passe décisive, contre…) au-dessus de la ligne de flottaison,
          aussi bien en 1440×900 qu'en 375×812. */}
      <div className="mx-auto w-full max-w-[240px]">
        <Court label="Demi-terrain — toucher le point de tir" onClick={pickFromEvent}>
          {shots?.map((s, i) => (
            <circle
              key={i}
              data-past-shot={s.made ? 'made' : 'missed'}
              cx={s.spot.x * W} cy={s.spot.y * D} r={11}
              fill={s.made ? C.accent : 'none'}
              stroke={s.made ? 'none' : C.muted} strokeWidth={5}
              opacity={0.5}
            />
          ))}
          <CourtLines />
          {confirmation && <Confirmation spot={confirmation.spot} made={confirmation.made} />}
        </Court>
      </div>
      {/* Toujours rendue (contenu vide sans confirmation) : la pastille ne doit jamais
          apparaître ni disparaître, sinon tout ce qui suit — dont les boutons de zone
          et « + 1 Lancer franc » — se décale pendant que le verrou anti-double-comptage
          les protège encore, exposant une fenêtre où un second tap vise une cible fantôme. */}
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
            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:brightness-125 disabled:opacity-40"
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
 * Point de tir enregistré : zone illuminée, point plein, anneau qui s'étend.
 * Même convention que les tirs passés (`shots?.map` plus haut) : disque plein en
 * `C.accent` pour un tir réussi, anneau creux gris pour un manqué. Sans quoi le
 * disque géant du retour visuel dirait « panier » même quand le tir est manqué.
 */
function Confirmation({ spot, made }: { spot: ShotSpot; made: boolean }) {
  const cx = spot.x * W
  const cy = spot.y * D
  return (
    <g>
      <path d={ZONE_PATH[zoneAt(spot.x, spot.y)]} fill={made ? C.accent : C.muted} fillOpacity={0.22} />
      <circle
        data-confirmation={made ? 'made' : 'missed'}
        cx={cx} cy={cy} r={26}
        fill={made ? C.accent : 'none'}
        stroke={made ? 'none' : C.accent} strokeWidth={made ? 0 : 10}
      />
      <circle cx={cx} cy={cy} r={26} fill="none" stroke={C.accent} strokeWidth={10}>
        <animate attributeName="r" from="26" to="160" dur={`${SHOT_FEEDBACK_MS}ms`} fill="freeze" />
        <animate attributeName="opacity" from="0.9" to="0" dur={`${SHOT_FEEDBACK_MS}ms`} fill="freeze" />
      </circle>
    </g>
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
        // Les corners sont trop étroits (90 unités) pour un ratio centré en
        // fontSize 62 gras (~175 unités) : même « 10/10 » déborde du viewBox.
        // Ancrer le texte à son bord plutôt qu'à son centre le fait toujours
        // grandir vers l'intérieur du terrain, quelle que soit sa longueur.
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
            fill={C.text}
          >
            {made}/{attempts}
          </text>
        )
      })}
    </Court>
  )
}
