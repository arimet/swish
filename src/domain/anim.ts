/**
 * Le domaine de l'animation : où est chaque chose à l'instant t ?
 *
 * Une flèche est un dessin, pas une trajectoire — rien dans le modèle de 8A ne
 * relie le bout d'un tracé à la position du pion au temps suivant. On interpole
 * donc entre les positions des temps, la seule paire dont le modèle garantisse
 * la cohérence, et la flèche ne sert qu'à courber le trajet après recalage.
 */
import type { Camp, Fleche, Pion, Point, Poste, Schema, Temps, Trait } from './plays'

/** Avancement dans la combinaison : `temps` est le rang du temps de départ,
 *  `part` la fraction parcourue vers le temps suivant (0 à 1). */
export interface Instant { temps: number; part: number }

/** Nombre de transitions animables — un schéma à trois temps en a deux. */
export const transitions = (s: Schema) => Math.max(0, s.temps.length - 1)

/** Les traits qui déplacent un pion ; la `passe` déplace le ballon, pas le joueur. */
const TRAITS_DE_PION: Trait[] = ['course', 'ecran', 'dribble']

/**
 * Applique au tracé la similitude — rotation, échelle uniforme, translation —
 * qui envoie son premier point sur `depart` et son dernier sur `arrivee`. La
 * forme du geste est préservée, les extrémités deviennent exactes. Un tracé
 * dégénéré (extrémités confondues) n'a pas de similitude définie : on retombe
 * sur la ligne droite.
 */
export function recaler(points: Point[], depart: Point, arrivee: Point): Point[] {
  if (points.length < 2) return [depart, arrivee]
  const a = points[0], b = points[points.length - 1]
  const dx = b.x - a.x, dy = b.y - a.y
  const n = dx * dx + dy * dy
  if (n === 0) return [depart, arrivee]
  const ex = arrivee.x - depart.x, ey = arrivee.y - depart.y
  // Nombre complexe (k + i·r) = (arrivee - depart) / (b - a) : rotation + échelle.
  const k = (ex * dx + ey * dy) / n
  const r = (ey * dx - ex * dy) / n
  return points.map((p) => {
    const ux = p.x - a.x, uy = p.y - a.y
    return { x: depart.x + k * ux - r * uy, y: depart.y + r * ux + k * uy }
  })
}

/** Interpolation linéaire entre deux points. */
const entre = (a: Point, b: Point, t: number): Point => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })

/**
 * Position à la fraction `part` de la **longueur** du tracé. C'est la longueur
 * cumulée qui compte, pas le rang des points : un geste échantillonné serré au
 * départ ralentirait là et bondirait ensuite, sans aucune raison.
 */
function avanceSur(points: Point[], part: number): Point {
  const cumul = [0]
  for (let i = 1; i < points.length; i++) {
    cumul.push(cumul[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const vise = part * cumul[cumul.length - 1]
  let i = 1
  while (i < points.length - 1 && cumul[i] < vise) i++
  // Segment de longueur nulle — tracé dégénéré, ou deux points confondus : on
  // reste sur place, plutôt que de diviser par zéro et de partir en NaN.
  const segment = cumul[i] - cumul[i - 1]
  return entre(points[i - 1], points[i], segment === 0 ? 0 : (vise - cumul[i - 1]) / segment)
}

/** Où se trouve le ballon d'un temps : la position de son porteur, ou le sol. */
function ouEstLeBallon(t: Temps): Point | null {
  const b = t.ballon
  if ('x' in b) return b
  const porteur = t.pions.find((p) => p.camp === b.camp && p.poste === b.poste)
  return porteur ? porteur.at : null
}

/** Le ballon est-il tenu par la même chose aux deux temps ? */
function memeBallon(a: Temps['ballon'], b: Temps['ballon']): boolean {
  if ('x' in a) return 'x' in b && a.x === b.x && a.y === b.y
  return !('x' in b) && a.camp === b.camp && a.poste === b.poste
}

/**
 * L'état figé d'un schéma à l'instant `at`, rendu comme un `Temps` — donc
 * directement affichable par le tableau. Chaque pion va de sa position au temps
 * N à celle du même pion au temps N+1 ; sa flèche, recalée sur ces deux
 * positions, ne fait que courber le trajet. L'instantané ne porte aucune
 * flèche : pendant l'animation on regarde les joueurs, pas les traits.
 */
export function instantane(s: Schema, at: Instant): Temps {
  const n = Math.max(0, Math.min(Math.floor(at.temps), transitions(s)))
  const depuis = s.temps[n]
  const vers = s.temps[n + 1]
  if (!vers) return { pions: structuredClone(depuis.pions), ballon: structuredClone(depuis.ballon), fleches: [] }
  const part = Math.max(0, Math.min(at.part, 1))

  const flecheDe = (camp: Camp, poste: Poste, traits: Trait[]): Fleche | undefined =>
    depuis.fleches.find((f) => f.depuis.camp === camp && f.depuis.poste === poste && traits.includes(f.trait))

  const trajet = (depart: Point, arrivee: Point, f: Fleche | undefined): Point =>
    f ? avanceSur(recaler(f.points, depart, arrivee), part) : entre(depart, arrivee, part)

  const pions = depuis.pions.map((pion): Pion => {
    const homologue = vers.pions.find((q) => q.camp === pion.camp && q.poste === pion.poste)
    const arrivee = homologue?.at ?? pion.at           // absent au temps suivant : il ne bouge pas
    // Immobile ou aux bornes : la valeur exacte du temps, sans interpolation qui ferait trembler.
    if ((arrivee.x === pion.at.x && arrivee.y === pion.at.y) || part <= 0) return { ...pion, at: { ...pion.at } }
    if (part >= 1) return { ...pion, at: { ...arrivee } }
    return { ...pion, at: trajet(pion.at, arrivee, flecheDe(pion.camp, pion.poste, TRAITS_DE_PION)) }
  })

  const ballon = ((): Temps['ballon'] => {
    if (memeBallon(depuis.ballon, vers.ballon) || part <= 0) return structuredClone(depuis.ballon)
    if (part >= 1) return structuredClone(vers.ballon)
    const depart = ouEstLeBallon(depuis)
    const arrivee = ouEstLeBallon(vers)
    if (!depart || !arrivee) return structuredClone(depuis.ballon)
    // En vol : ni porté, ni posé où il était. Une flèche de passe du porteur courbe le trajet.
    const passe = 'x' in depuis.ballon ? undefined : flecheDe(depuis.ballon.camp, depuis.ballon.poste, ['passe'])
    return trajet(depart, arrivee, passe)
  })()

  return { pions, ballon, fleches: [] }
}
