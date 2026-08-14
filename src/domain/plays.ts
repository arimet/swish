/**
 * Le domaine du tableau tactique : un schéma est une suite de temps, chaque
 * temps porte les positions complètes des pions, le ballon et ses flèches.
 * Coordonnées normalisées 0..1 dans le terrain choisi : sur `demi`, y va de la
 * ligne de fond (0) à la ligne médiane (1) ; sur `complet`, la médiane est à
 * 0,5 et la moitié avant est y ≤ 0,5.
 */
export type Terrain = 'demi' | 'complet'
export type Camp = 'attaque' | 'defense'
export type Poste = 1 | 2 | 3 | 4 | 5
export type Trait = 'course' | 'ecran' | 'passe' | 'dribble'

export interface Point { x: number; y: number }

export interface Pion { camp: Camp; poste: Poste; at: Point }

/** Points échantillonnés du geste, lissés au rendu. Le dernier porte la pointe
 *  (ou la barre en T pour un écran). */
export interface Fleche { depuis: { camp: Camp; poste: Poste }; points: Point[]; trait: Trait }

export interface Temps {
  pions: Pion[]                                   // 5 ou 10 selon `defense`
  ballon: { camp: Camp; poste: Poste } | Point    // porté par un pion, ou posé au sol
  fleches: Fleche[]
}

export interface ObjetPose { sorte: 'plot' | 'ballon' | 'echelle'; at: Point }

export interface Schema {
  id: string
  clubId: string
  nom: string
  note?: string
  terrain: Terrain
  defense: boolean
  objets: ObjetPose[]                             // communs à tous les temps
  temps: Temps[]                                  // au moins un
  /** Étiquette de rangement. Absent = « Sans dossier ». Un seul niveau : la liste
   *  des dossiers se déduit des schémas, il n'y a ni table ni entité. */
  dossier?: string
  /** Date ISO du dernier enregistrement, écrite par la persistance. Sert à ranger
   *  la bibliothèque du plus récent au plus ancien. Absente sur les schémas
   *  enregistrés avant qu'on l'horodate. */
  majLe?: string
}

/** Les dossiers déclarés par ces schémas : valeurs distinctes non vides, triées à
 *  la française (« Écran » avant « Remise »). Un dossier vidé de ses schémas
 *  disparaît de lui-même, puisque rien ne le stocke ailleurs. */
export function dossiers(schemas: Schema[]): string[] {
  const noms = new Set(schemas.map((s) => s.dossier?.trim()).filter((d): d is string => !!d))
  return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Position du panier, normalisée, par terrain (1,575 m de la ligne de fond). */
export const PANIER: Record<Terrain, Point[]> = {
  demi: [{ x: 0.5, y: 1.575 / 14 }],
  complet: [{ x: 0.5, y: 1.575 / 28 }, { x: 0.5, y: 1 - 1.575 / 28 }],
}

// 1-2-2 sur demi-terrain : meneur en tête de raquette, deux ailiers, deux postes bas.
const MISE_EN_PLACE: Record<Poste, Point> = {
  1: { x: 0.5, y: 0.62 }, 2: { x: 0.22, y: 0.48 }, 3: { x: 0.78, y: 0.48 },
  4: { x: 0.3, y: 0.2 }, 5: { x: 0.7, y: 0.2 },
}

const POSTES: Poste[] = [1, 2, 3, 4, 5]

/**
 * Un schéma vierge : le 1-2-2 d'attaque, une défense en miroir si demandée
 * (chaque défenseur au milieu du segment attaquant-panier), le ballon au
 * meneur. Sur terrain complet, la mise en place occupe la moitié avant.
 * L'`id` est laissé à la persistance.
 */
export function nouveauSchema(clubId: string, terrain: Terrain, defense: boolean): Omit<Schema, 'id'> {
  const panier = PANIER[terrain][0]
  const attaque: Pion[] = POSTES.map((poste) => {
    const base = MISE_EN_PLACE[poste]
    return { camp: 'attaque', poste, at: { x: base.x, y: terrain === 'complet' ? base.y / 2 : base.y } }
  })
  const pions = defense
    ? [...attaque, ...attaque.map((a): Pion => ({
        camp: 'defense',
        poste: a.poste,
        at: { x: (a.at.x + panier.x) / 2, y: (a.at.y + panier.y) / 2 },
      }))]
    : attaque
  return {
    clubId,
    nom: 'Nouveau schéma',
    terrain,
    defense,
    objets: [],
    temps: [{ pions, ballon: { camp: 'attaque', poste: 1 }, fleches: [] }],
  }
}

/**
 * Le temps qui suit : mêmes positions, même ballon, flèches vides. Le coach
 * fait glisser les pions là où ses flèches les envoyaient — il ne replace pas
 * cinq pions à chaque temps.
 */
export function tempsSuivant(t: Temps): Temps {
  return { pions: structuredClone(t.pions), ballon: structuredClone(t.ballon), fleches: [] }
}

/** Distance de `p` au segment [a, b], au point le plus proche. Exportée parce que
 *  la gomme de l'éditeur cherche la flèche sous le doigt avec la même mesure. */
export function distanceAuSegment(p: Point, a: Point, b: Point): number {
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
export function reduireTrace(points: Point[], epsilon = 0.01): Point[] {
  if (points.length < 3) return points
  const debut = points[0]
  const fin = points[points.length - 1]
  let distMax = 0
  let iMax = 0
  for (let i = 1; i < points.length - 1; i++) {
    const dist = distanceAuSegment(points[i], debut, fin)
    if (dist > distMax) { distMax = dist; iMax = i }
  }
  if (distMax <= epsilon) return [debut, fin]
  return [
    ...reduireTrace(points.slice(0, iMax + 1), epsilon).slice(0, -1),
    ...reduireTrace(points.slice(iMax), epsilon),
  ]
}

/** Copie du schéma sur le terrain donné, tous les y passés par `f`. */
function remapY(s: Schema, terrain: Terrain, f: (y: number) => number): Schema {
  const pt = (p: Point): Point => ({ x: p.x, y: f(p.y) })
  return {
    ...s,
    terrain,
    objets: s.objets.map((o) => ({ ...o, at: pt(o.at) })),
    temps: s.temps.map((t) => ({
      pions: t.pions.map((p) => ({ ...p, at: pt(p.at) })),
      ballon: 'x' in t.ballon ? pt(t.ballon) : { ...t.ballon },
      fleches: t.fleches.map((fl) => ({ ...fl, points: fl.points.map(pt) })),
    })),
  }
}

/** Le premier occupant de la moitié arrière (y > 0,5), nommé pour le refus. */
function occupantMoitieArriere(s: Schema): string | null {
  for (const t of s.temps) {
    for (const p of t.pions) if (p.at.y > 0.5) return `le poste ${p.poste}`
    for (const fl of t.fleches) if (fl.points.some((p) => p.y > 0.5)) return `une flèche du poste ${fl.depuis.poste}`
  }
  const noms: Record<ObjetPose['sorte'], string> = { plot: 'un plot', ballon: 'un ballon', echelle: 'une échelle' }
  for (const o of s.objets) if (o.at.y > 0.5) return noms[o.sorte]
  for (const t of s.temps) if ('x' in t.ballon && t.ballon.y > 0.5) return 'le ballon'
  return null
}

/**
 * Change le terrain d'un schéma. demi → complet remappe dans la moitié avant,
 * sans perte ; complet → demi est refusé tant qu'un pion, une flèche, un objet
 * ou le ballon posé occupe la moitié arrière — remapper en silence perdrait la
 * moitié du dessin.
 */
export function versTerrain(s: Schema, terrain: Terrain): { ok: Schema } | { refus: string } {
  if (s.terrain === terrain) return { ok: s }
  if (terrain === 'complet') return { ok: remapY(s, terrain, (y) => y / 2) }
  const occupant = occupantMoitieArriere(s)
  if (occupant) return { refus: `Impossible de passer en demi-terrain : ${occupant} occupe la moitié arrière.` }
  return { ok: remapY(s, terrain, (y) => y * 2) }
}
