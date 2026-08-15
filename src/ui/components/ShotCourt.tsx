import { useId, type ReactNode } from 'react'
import { zoneSummary, type Shot } from '../../domain/shotchart'
import { zoneAt, ZONE_CENTROID, ZONE_LABELS, ZONES, type ShotZone } from '../../domain/shotzones'
import type { ShotSpot } from '../../domain/types'
import { C, T } from '../olive/kit'
import { useT } from '../../i18n'

// viewBox en centimètres, ligne de fond en haut. Voir les repères du plan.
// Exportés parce que le tableau tactique dessine sur le même demi-terrain — et,
// pour le terrain complet, sur son miroir : une seule géométrie pour tous.
/** Rayon des coins, en unités de terrain : 110 sur 1500 de large, soit environ
 *  7 % — assez pour se voir à toute taille, ce qu'un rayon en pixels ne fait pas. */
export const RAYON = 110

export const W = 1500
export const D = 1400

/**
 * Le cadre du terrain : rentré de 4 unités du viewBox et arrondi de `RAYON`.
 * Une seule définition, parce que trois tracés doivent coïncider au pixel près —
 * le cadre dessiné, son homologue du terrain complet, et la découpe des zones.
 * `h` est la profondeur : `D` pour un demi-terrain, le double pour un complet.
 */
export const cadre = (h = D) => ({ x: 4, y: 4, width: W - 8, height: h - 8, rx: RAYON })

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
  // Les lignes d'un terrain sont peintes, pas suggérées. Elles étaient à 70 %,
  // 40 % et 22 % d'opacité : même les principales étaient des fantômes, et c'est
  // ce qui donnait au tableau son air de brouillon plutôt que de terrain. Les
  // principales passent à l'opacité pleine ; les secondaires gardent un retrait,
  // parce qu'un cercle de lancer franc n'a pas à disputer l'attention aux joueurs.
  const major = { fill: 'none', stroke: 'currentColor', strokeWidth: 9, opacity: 1 } as const
  const minor = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, opacity: 0.62 } as const
  const faint = { fill: 'none', stroke: 'currentColor', strokeWidth: 4, opacity: 0.34 } as const
  return (
    <g style={{ color: T.line }}>
      {/* La raquette **peinte**, comme dans un gymnase. Elle était remplie de l'encre
          des trajets à cinq pour cent d'opacité, c'est-à-dire invisible : le terrain
          n'avait aucune couleur propre, seulement des marques posées sur une dalle
          nue. C'est la surface qui manquait, pas la teinte du bois. */}
      <rect x={505} y={0} width={490} height={580} fill={T.paint} />
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
      {bord && <rect {...cadre()} {...major} />}
    </g>
  )
}

/**
 * Découpe ses enfants à la forme réelle du terrain. Les contours de `ZONE_PATH`
 * courent jusqu'au bord du viewBox — `corner3_left` part de (0,0) — alors que le
 * terrain s'arrête au cadre, rentré et arrondi : sans cette découpe, le
 * remplissage d'une zone déborde dans les coins que le cadre arrondit.
 */
function ZonesDecoupees({ children }: { children: ReactNode }) {
  const id = `terrain-${useId()}`
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
      {/* Le fond porte l'arrondi, pas un masque CSS : un rayon en pixels ne suit
          pas la taille du terrain et laisse le cadre dessiné, coté en unités de
          terrain, dépasser ou se faire couper. Ici les deux coïncident toujours. */}
      <rect x={2} y={2} width={W - 4} height={D - 4} rx={RAYON} fill={`url(#${gid})`} />
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
  const trad = useT()
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
              fill={s.made ? T.attack : 'none'}
              stroke={s.made ? 'none' : T.line} strokeWidth={5}
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
            className="rounded-lg px-2 py-1 text-[12px] font-semibold transition hover:brightness-125 disabled:opacity-40"
            style={{ background: C.card2, color: C.muted, border: `1px solid ${C.border}` }}
          >
            {trad(ZONE_LABELS[z])}
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
      <ZonesDecoupees>
        <path d={ZONE_PATH[zoneAt(spot.x, spot.y)]} fill={made ? T.attack : T.line} fillOpacity={0.22} />
      </ZonesDecoupees>
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
 * Carte de chaleur. Une zone reste neutre sous `minAttempts` tentatives :
 * afficher « 100 % » sur un seul tir donnerait une lecture fausse.
 */
export function ShotChart({ shots, minAttempts = 3 }: { shots: Shot[]; minAttempts?: number }) {
  const trad = useT()
  const sum = zoneSummary(shots)
  return (
    <Court label={trad('bord.carteDesTirs')}>
      <ZonesDecoupees>
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
      </ZonesDecoupees>
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
            fill={T.ink}
          >
            {made}/{attempts}
          </text>
        )
      })}
    </Court>
  )
}
