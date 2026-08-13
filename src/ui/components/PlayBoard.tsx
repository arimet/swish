/**
 * Le rendu du tableau tactique : un terrain (demi ou complet), les objets posés,
 * puis un temps du schéma — flèches, pions, ballon. Purement présentatif :
 * l'éditeur pose ses gestes par-dessus via les callbacks et `children`, il ne
 * redessine rien.
 */
import type { ReactNode } from 'react'
import type { Fleche, ObjetPose, Pion, Point, Schema, Temps } from '../../domain/plays'
import { C } from '../olive/kit'
import { cadre, clamp01, CourtLines, D, RAYON, W } from './ShotCourt'

/** Profondeur du viewBox : le terrain complet, c'est le demi et son miroir. */
const profondeur = (s: Schema) => (s.terrain === 'complet' ? D * 2 : D)

/**
 * Largeur maximale d'un terrain affiché. Trois bornes, et c'est la plus petite
 * qui l'emporte :
 *
 * — `100%`, la largeur réellement disponible. Elle est la seule à ne jamais
 *   mentir : sans elle, un téléphone de 375 px se voyait imposer un terrain de
 *   422 px (52 % de 812 px de haut), qui débordait de la colonne et se faisait
 *   couper à droite. La hauteur d'écran ne dit rien de la largeur d'une colonne.
 * — la place verticale qu'on s'autorise, exprimée en `vh` : un tableau tactique
 *   se lit d'un coup d'œil, et ce qui le limite d'ordinaire est la hauteur.
 *   Comme la largeur suit le rapport du terrain, on la déduit de cette hauteur.
 *   Un demi-terrain fait 15/14, donc 77vh de haut valent ~77vh de large ; le
 *   terrain complet est deux fois plus profond, donc deux fois moins large.
 * — un plafond en pixels, pour les très grands écrans où suivre la hauteur
 *   donnerait un terrain de plus d'un mètre : passé une certaine taille l'œil
 *   balaie au lieu d'embrasser, et rien n'est gagné.
 *
 * C'est bien la **largeur** qui est bornée, jamais la hauteur : la boîte du SVG
 * doit garder exactement le rapport du viewBox, sinon il se centre dans des
 * marges et `versSvg` convertit les gestes de travers.
 */
export const largeurTerrain = (terrain: Schema['terrain'], place: 'lecture' | 'edition' = 'lecture') => {
  // L'édition a plus à loger sous le terrain — barre d'outils, bande des temps —
  // que la lecture, qui n'a qu'un rang de commandes. D'où deux réserves.
  const vh = place === 'edition' ? 52 : 77
  const max = place === 'edition' ? 560 : 840
  const part = terrain === 'complet' ? 2 : 1
  return `min(100%, ${vh / part}vh, ${max / part}px)`
}

/** Coordonnées normalisées → unités du viewBox (des centimètres). */
const enUnites = (p: Point, h: number): Point => ({ x: p.x * W, y: p.y * h })

const n1 = (v: number) => v.toFixed(1)

/**
 * Conversion écran → coordonnées normalisées, bornée aux limites du terrain.
 * L'éditeur s'en sert pour chaque point de geste ; d'où la tolérance au SVG
 * pas encore mesuré (boîte vide), qui renverrait sinon des NaN.
 */
export function versSvg(e: { clientX: number; clientY: number }, svg: SVGSVGElement): Point {
  const r = svg.getBoundingClientRect()
  if (!r.width || !r.height) return { x: 0, y: 0 }
  return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
}

/**
 * Lissage Catmull-Rom → Bézier cubique : le tracé passe par tous les points
 * échantillonnés au lieu de les couper. Deux points : un segment droit, un
 * geste rectiligne ne doit pas bomber.
 */
function lisser(pts: Point[]): string {
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
 * Le trait de dribble : une sinusoïde suivie le long de la polyligne, décalage
 * perpendiculaire à la direction locale. Échantillonner tous les `pas` donne
 * environ dix points par ondulation — assez pour que l'œil lise une courbe.
 */
function onduler(pts: Point[], amp = 26, lambda = 130, pas = 13): string {
  const out: Point[] = []
  let parcouru = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (!L) continue
    const ux = (b.x - a.x) / L
    const uy = (b.y - a.y) / L
    for (let t = 0; t < L; t += pas) {
      const o = amp * Math.sin((2 * Math.PI * (parcouru + t)) / lambda)
      out.push({ x: a.x + ux * t - uy * o, y: a.y + uy * t + ux * o })
    }
    parcouru += L
  }
  // Le dernier point exact : la pointe de flèche s'aligne dessus.
  out.push(pts[pts.length - 1])
  return out.map((p, i) => `${i ? 'L' : 'M'} ${n1(p.x)} ${n1(p.y)}`).join(' ')
}

/** Pointe de flèche : deux segments ouverts, ~33° de part et d'autre du tracé. */
function pointe(a: Point, b: Point, taille = 54): string {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const bras = (d: number) => `${n1(b.x + taille * Math.cos(ang + d))} ${n1(b.y + taille * Math.sin(ang + d))}`
  return `M ${bras(Math.PI * 0.815)} L ${n1(b.x)} ${n1(b.y)} L ${bras(-Math.PI * 0.815)}`
}

/**
 * L'écran : barre en T perpendiculaire au dernier segment, à la place de la
 * pointe. C'est la convention du carnet — une pointe ici se lirait « course ».
 */
function barreT(a: Point, b: Point, demi = 58): string {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = (-(b.y - a.y) / L) * demi
  const ny = ((b.x - a.x) / L) * demi
  return `M ${n1(b.x - nx)} ${n1(b.y - ny)} L ${n1(b.x + nx)} ${n1(b.y + ny)}`
}

/**
 * Ce que la mise bout à bout des deux moitiés ne donne pas : le cadre du terrain
 * complet d'un seul tenant, la ligne médiane (une seule) et le rond central.
 * Les deux `CourtLines` sont donc rendues sans leur propre cadre.
 */
function Milieu() {
  const trait = { fill: 'none', stroke: C.muted, strokeWidth: 9, opacity: 0.7 } as const
  return (
    <g>
      <line x1={4} y1={D} x2={W - 4} y2={D} {...trait} />
      <circle cx={W / 2} cy={D} r={180} {...trait} strokeWidth={6} opacity={0.4} />
      <rect {...cadre(D * 2)} {...trait} />
    </g>
  )
}

/** Les quatre traits du carnet de coach, distingués par la forme seule. */
function FlecheTracee({ f, h }: { f: Fleche; h: number }) {
  const pts = f.points.map((p) => enUnites(p, h))
  if (pts.length < 2) return null
  const a = pts[pts.length - 2]
  const b = pts[pts.length - 1]
  return (
    <g data-trait={f.trait} fill="none" stroke={C.text} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round">
      <path
        d={f.trait === 'dribble' ? onduler(pts) : lisser(pts)}
        strokeDasharray={f.trait === 'passe' ? '38 30' : undefined}
      />
      <path d={f.trait === 'ecran' ? barreT(a, b) : pointe(a, b)} />
    </g>
  )
}

/**
 * Attaque : disque plein rose, numéro blanc. Défense : croix tracée puis numéro,
 * en blanc sur un liseré sombre.
 *
 * La croix était un simple texte gris qui se noyait dans les lignes du terrain,
 * surtout en vignette. Tracée, elle porte le même poids de trait que le disque :
 * les deux camps se lisent d'un coup d'œil, et se distinguent par la **forme** —
 * disque plein contre croix ouverte — donc aussi en noir et blanc.
 * La paire croix + numéro reste centrée sur la position du pion, comme avant :
 * la croix occupe la moitié gauche, le numéro la moitié droite.
 */
function PionDessine({ pion, h }: { pion: Pion; h: number }) {
  const { x, y } = enUnites(pion.at, h)
  const commun = { textAnchor: 'middle', dominantBaseline: 'central', fontWeight: 900 } as const
  if (pion.camp === 'defense') {
    // Même encombrement que l'attaquant, et un seul glyphe : la croix posée à côté
    // de son chiffre s'étalait sur deux fois la largeur d'un disque et se lisait
    // comme deux choses. Ici le numéro est là où l'œil le cherche, au centre du pion.
    // La distinction tient sans la couleur — disque plein contre disque ouvert —
    // et le fond opaque détache le pion des lignes du terrain.
    return (
      <g data-pion="defense">
        <circle cx={x} cy={y} r={54} fill={C.frame} stroke={C.def} strokeWidth={13} />
        <text x={x} y={y} {...commun} fontSize={62} fill={C.def}>{String(pion.poste)}</text>
      </g>
    )
  }
  return (
    <g data-pion="attaque">
      <circle cx={x} cy={y} r={54} fill={C.accent} />
      <text x={x} y={y} {...commun} fontSize={62} fill="#fff">{String(pion.poste)}</text>
    </g>
  )
}

/** Le ballon : sur le pion porteur (décalé pour ne pas masquer son numéro), ou
 *  au sol. Ambre et non rose : posé sur un attaquant rose, il disparaîtrait. */
function Ballon({ t, h }: { t: Temps; h: number }) {
  const b = t.ballon
  let at: Point | null = null
  if ('x' in b) at = enUnites(b, h)
  else {
    const porteur = t.pions.find((p) => p.camp === b.camp && p.poste === b.poste)
    if (porteur) {
      const u = enUnites(porteur.at, h)
      at = { x: u.x + 48, y: u.y - 48 }
    }
  }
  if (!at) return null
  return <circle aria-label="ballon" cx={at.x} cy={at.y} r={28} fill={C.amber} stroke={C.frame} strokeWidth={6} />
}

/** Plot, ballon posé, échelle de rythme : le matériel de l'exercice, commun à
 *  tous les temps. */
function Objet({ o, h }: { o: ObjetPose; h: number }) {
  const { x, y } = enUnites(o.at, h)
  return (
    <g data-objet={o.sorte} transform={`translate(${n1(x)} ${n1(y)})`} fill="none" stroke={C.amber} strokeWidth={8} opacity={0.9}>
      {o.sorte === 'plot' && <path d="M 0 -34 L 27 30 H -27 Z" fill={C.amber} stroke="none" />}
      {o.sorte === 'ballon' && (
        <>
          <circle r={26} />
          <path d="M -26 0 H 26 M 0 -26 A 32 32 0 0 0 0 26 M 0 -26 A 32 32 0 0 1 0 26" />
        </>
      )}
      {o.sorte === 'echelle' && <path d="M -30 -46 V 46 M 30 -46 V 46 M -30 -23 H 30 M -30 0 H 30 M -30 23 H 30" />}
    </g>
  )
}

/**
 * Le tableau. `tempsIndex` choisit le temps affiché ; hors bornes, on retombe
 * sur le premier — un schéma a toujours au moins un temps, une vignette ne doit
 * jamais rendre un terrain vide. `apercu` coupe toute interaction (vignettes).
 */
export function PlayBoard({ schema, tempsIndex, temps, onPointerDown, onPointerMove, onPointerUp, children, apercu, remplit }: {
  schema: Schema
  tempsIndex: number
  /** Un temps calculé — l'instantané du lecteur — à afficher au lieu de celui du
   *  schéma. Le rendu ne change pas : l'animation n'est qu'une suite d'états. */
  temps?: Temps
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void
  children?: ReactNode
  apercu?: boolean
  /** Le SVG remplit sa boîte au lieu de suivre sa largeur. Réservé au lecteur, qui
   *  cale lui-même le rapport du terrain : un appelant qui convertit des
   *  coordonnées de pointeur ne doit pas l'utiliser. */
  remplit?: boolean
}) {
  const h = profondeur(schema)
  const t = temps ?? schema.temps[tempsIndex] ?? schema.temps[0]
  const interactif = !apercu && !!(onPointerDown || onPointerMove || onPointerUp)
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      role={interactif ? 'application' : 'img'}
      aria-label={`tableau tactique — ${schema.nom}`}
      onPointerDown={apercu ? undefined : onPointerDown}
      onPointerMove={apercu ? undefined : onPointerMove}
      onPointerUp={apercu ? undefined : onPointerUp}
      className={`${remplit ? 'h-full w-full' : 'w-full'} ${interactif ? 'cursor-crosshair' : ''}`}
      style={{ touchAction: interactif ? 'none' : 'manipulation' }}
    >
      {/* Le fond porte l'arrondi, pas un masque CSS : coté en unités de terrain,
          il suit la taille du tableau et coïncide toujours avec le cadre dessiné. */}
      <rect x={2} y={2} width={W - 4} height={h - 4} rx={RAYON} fill={C.panel} />
      <CourtLines bord={schema.terrain === 'demi'} />
      {schema.terrain === 'complet' && (
        <>
          <g transform={`translate(0 ${D * 2}) scale(1 -1)`}>
            <CourtLines bord={false} />
          </g>
          <Milieu />
        </>
      )}
      {schema.objets.map((o, i) => <Objet key={i} o={o} h={h} />)}
      {/* Les flèches d'abord : un pion ne doit jamais être barré par un trait. */}
      {t.fleches.map((f, i) => <FlecheTracee key={i} f={f} h={h} />)}
      {t.pions.map((p) => <PionDessine key={`${p.camp}${p.poste}`} pion={p} h={h} />)}
      <Ballon t={t} h={h} />
      {children}
    </svg>
  )
}
