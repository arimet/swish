/**
 * Le domaine du tableau tactique : un schéma est une suite de temps, chaque
 * temps porte les positions complètes des pions, le ballon et ses flèches.
 * Coordonnées normalisées 0..1 dans le terrain choisi : sur `demi`, y va de la
 * ligne de fond (0) à la ligne médiane (1) ; sur `complet`, la médiane est à
 * 0,5 et la moitié avant est y ≤ 0,5.
 */
export type Court = 'half' | 'full'
export type Side = 'offense' | 'defense'
export type Position = 1 | 2 | 3 | 4 | 5
export type Stroke = 'cut' | 'screen' | 'pass' | 'dribble'

export interface Point { x: number; y: number }

export interface Marker { side: Side; position: Position; at: Point }

/** Points échantillonnés du geste, lissés au rendu. Le dernier porte la pointe
 *  (ou la barre en T pour un écran). */
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
  nom: string
  note?: string
  court: Court
  defense: boolean
  props: Prop[]                             // communs à tous les temps
  temps: Step[]                                  // au moins un
  /** Étiquette de rangement. Absent = « Sans dossier ». Un seul niveau : la liste
   *  des dossiers se déduit des schémas, il n'y a ni table ni entité. */
  folder?: string
  /** Date ISO du dernier enregistrement, écrite par la persistance. Sert à ranger
   *  la bibliothèque du plus récent au plus ancien. Absente sur les schémas
   *  enregistrés avant qu'on l'horodate. */
  updatedAt?: string
}

/** Les dossiers déclarés par ces schémas : valeurs distinctes non vides, triées à
 *  la française (« Écran » avant « Remise »). Un dossier vidé de ses schémas
 *  disparaît de lui-même, puisque rien ne le stocke ailleurs. */
export function folders(schemas: Play[]): string[] {
  const noms = new Set(schemas.map((s) => s.folder?.trim()).filter((d): d is string => !!d))
  return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Position du panier, normalisée, par terrain (1,575 m de la ligne de fond). */
export const BASKET: Record<Court, Point[]> = {
  half: [{ x: 0.5, y: 1.575 / 14 }],
  full: [{ x: 0.5, y: 1.575 / 28 }, { x: 0.5, y: 1 - 1.575 / 28 }],
}

// 1-2-2 sur demi-terrain : meneur en tête de raquette, deux ailiers, deux postes bas.
const SETUP: Record<Position, Point> = {
  1: { x: 0.5, y: 0.62 }, 2: { x: 0.22, y: 0.48 }, 3: { x: 0.78, y: 0.48 },
  4: { x: 0.3, y: 0.2 }, 5: { x: 0.7, y: 0.2 },
}

const POSITIONS: Position[] = [1, 2, 3, 4, 5]

/**
 * Un schéma vierge : le 1-2-2 d'attaque, une défense en miroir si demandée
 * (chaque défenseur au milieu du segment attaquant-panier), le ballon au
 * meneur. Sur terrain complet, la mise en place occupe la moitié avant.
 * L'`id` est laissé à la persistance.
 */
export const DEFAULT_PLAY_NAME = 'sch.nouveauNom'

export function newPlay(clubId: string, court: Court, defense: boolean): Omit<Play, 'id'> {
  const panier = BASKET[court][0]
  const offense: Marker[] = POSITIONS.map((position) => {
    const base = SETUP[position]
    return { side: 'offense', position, at: { x: base.x, y: court === 'full' ? base.y / 2 : base.y } }
  })
  const markers = defense
    ? [...offense, ...offense.map((a): Marker => ({
        side: 'defense',
        position: a.position,
        at: { x: (a.at.x + panier.x) / 2, y: (a.at.y + panier.y) / 2 },
      }))]
    : offense
  return {
    clubId,
    nom: DEFAULT_PLAY_NAME,
    court,
    defense,
    props: [],
    temps: [{ markers, ball: { side: 'offense', position: 1 }, arrows: [] }],
  }
}

/**
 * Le temps qui suit : mêmes positions, même ballon, flèches vides. Le coach
 * fait glisser les pions là où ses flèches les envoyaient — il ne replace pas
 * cinq pions à chaque temps.
 */
export function nextStep(t: Step): Step {
  return { markers: structuredClone(t.markers), ball: structuredClone(t.ball), arrows: [] }
}

/** Distance de `p` au segment [a, b], au point le plus proche. Exportée parce que
 *  la gomme de l'éditeur cherche la flèche sous le doigt avec la même mesure. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Réduit un geste échantillonné à ses points saillants sans perdre la forme
 * (Ramer-Douglas-Peucker) : un tracé en L garde son coude. Le seuil est en
 * unités normalisées ; moins de trois points, le tracé est rendu tel quel.
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

/** Copie du schéma sur le terrain donné, tous les y passés par `f`. */
function remapY(s: Play, court: Court, f: (y: number) => number): Play {
  const pt = (p: Point): Point => ({ x: p.x, y: f(p.y) })
  return {
    ...s,
    court,
    props: s.props.map((o) => ({ ...o, at: pt(o.at) })),
    temps: s.temps.map((t) => ({
      markers: t.markers.map((p) => ({ ...p, at: pt(p.at) })),
      ball: 'x' in t.ball ? pt(t.ball) : { ...t.ball },
      arrows: t.arrows.map((fl) => ({ ...fl, points: fl.points.map(pt) })),
    })),
  }
}

/** Ce qui occupe la moitié arrière (y > 0,5), désigné par une clef de traduction et
 *  le numéro de poste s'il y en a un. Le domaine nomme, l'interface rédige. */
export interface Occupant { cle: string; n?: number }

function backcourtOccupant(s: Play): Occupant | null {
  for (const t of s.temps) {
    for (const p of t.markers) if (p.at.y > 0.5) return { cle: 'sch.occPoste', n: p.position }
    for (const fl of t.arrows) if (fl.points.some((p) => p.y > 0.5)) return { cle: 'sch.occFleche', n: fl.from.position }
  }
  const noms: Record<Prop['kind'], string> = { cone: 'sch.occPlot', ball: 'sch.occBallonPose', ladder: 'sch.occEchelle' }
  for (const o of s.props) if (o.at.y > 0.5) return { cle: noms[o.kind] }
  for (const t of s.temps) if ('x' in t.ball && t.ball.y > 0.5) return { cle: 'sch.occBallon' }
  return null
}

/**
 * Change le terrain d'un schéma. demi → complet remappe dans la moitié avant,
 * sans perte ; complet → demi est refusé tant qu'un pion, une flèche, un objet
 * ou le ballon posé occupe la moitié arrière — remapper en silence perdrait la
 * moitié du dessin.
 */
export function toCourt(s: Play, court: Court): { ok: Play } | { refus: Occupant } {
  if (s.court === court) return { ok: s }
  if (court === 'full') return { ok: remapY(s, court, (y) => y / 2) }
  const occupant = backcourtOccupant(s)
  if (occupant) return { refus: occupant }
  return { ok: remapY(s, court, (y) => y * 2) }
}
