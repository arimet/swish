/**
 * Le domaine de l'animation : où est chaque chose à l'instant t ?
 *
 * Une flèche est un dessin, pas une trajectoire — rien dans le modèle de 8A ne
 * relie le bout d'un tracé à la position du pion au temps suivant. On interpole
 * donc entre les positions des temps, la seule paire dont le modèle garantisse
 * la cohérence, et la flèche ne sert qu'à courber le trajet après recalage.
 */
import type { Side, Arrow, Marker, Point, Position, Play, Step, Stroke } from './plays'

/** Avancement dans la combinaison : `temps` est le rang du temps de départ,
 *  `part` la fraction parcourue vers le temps suivant (0 à 1). */
export interface Instant { temps: number; part: number }

/** Nombre de transitions animables — un schéma à trois temps en a deux. */
export const transitions = (s: Play) => Math.max(0, s.temps.length - 1)

/** Les traits qui déplacent un pion ; la `passe` déplace le ballon, pas le joueur. */
const TRAITS_DE_PION: Stroke[] = ['cut', 'screen', 'dribble']

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
function ouEstLeBallon(t: Step): Point | null {
  const b = t.ball
  if ('x' in b) return b
  const porteur = t.markers.find((p) => p.side === b.side && p.position === b.position)
  return porteur ? porteur.at : null
}

/** Le ballon est-il tenu par la même chose aux deux temps ? */
function memeBallon(a: Step['ball'], b: Step['ball']): boolean {
  if ('x' in a) return 'x' in b && a.x === b.x && a.y === b.y
  return !('x' in b) && a.side === b.side && a.position === b.position
}

/**
 * L'état figé d'un schéma à l'instant `at`, rendu comme un `Temps` — donc
 * directement affichable par le tableau. Chaque pion va de sa position au temps
 * N à celle du même pion au temps N+1 ; sa flèche, recalée sur ces deux
 * positions, ne fait que courber le trajet.
 *
 * `avecLignes` décide de ce que porte `fleches`. Éteint — le défaut, et le seul
 * comportement qui existait — l'instantané n'en porte aucune : pendant
 * l'animation on regarde les joueurs, pas les traits. Allumé, il porte les
 * **trajets réellement suivis** : non pas les flèches du carnet, mais ces mêmes
 * flèches recalées sur les positions des deux temps, c'est-à-dire exactement la
 * courbe qui transporte chaque pion.
 *
 * Cette distinction est tout l'intérêt de l'option. Réafficher les flèches
 * dessinées telles quelles serait plus simple, et faux : elles partent des
 * positions du carnet alors que les pions sont ailleurs, et le décalage se lirait
 * comme une panne. Une ligne qui divergerait du mouvement qu'elle prétend décrire
 * serait pire que pas de ligne du tout.
 */
export function instantane(s: Play, at: Instant, avecLignes = false): Step {
  const n = Math.max(0, Math.min(Math.floor(at.temps), transitions(s)))
  const from = s.temps[n]
  const vers = s.temps[n + 1]
  if (!vers) return { markers: structuredClone(from.markers), ball: structuredClone(from.ball), arrows: [] }
  const part = Math.max(0, Math.min(at.part, 1))

  const flecheDe = (side: Side, position: Position, traits: Stroke[]): Arrow | undefined =>
    from.arrows.find((f) => f.from.side === side && f.from.position === position && traits.includes(f.stroke))

  /** Le trajet complet, une fois pour toutes : la courbe dessinée recalée sur les
   *  deux positions, ou la corde s'il n'y a rien de dessiné. C'est cette liste de
   *  points qui sert **et** à placer le mobile **et** à tracer la ligne — d'où
   *  l'impossibilité qu'elles se contredisent. */
  const chemin = (depart: Point, arrivee: Point, f: Arrow | undefined): Point[] =>
    f ? recaler(f.points, depart, arrivee) : [depart, arrivee]

  /** Les lignes émises, dans l'ordre où les mobiles les engendrent. */
  const lignes: Arrow[] = []

  const markers = from.markers.map((pion): Marker => {
    const homologue = vers.markers.find((q) => q.side === pion.side && q.position === pion.position)
    const arrivee = homologue?.at ?? pion.at           // absent au temps suivant : il ne bouge pas
    const immobile = arrivee.x === pion.at.x && arrivee.y === pion.at.y
    const dessinee = flecheDe(pion.side, pion.position, TRAITS_DE_PION)
    // La ligne se calcule même aux bornes : à `part` 0 rien n'a encore bougé, mais
    // le trajet doit déjà s'afficher — il annonce le geste, il ne le commente pas
    // après coup. Un pion immobile n'en reçoit aucune : il n'a pas de trajet.
    if (avecLignes && !immobile) {
      lignes.push({
        from: { side: pion.side, position: pion.position },
        points: chemin(pion.at, arrivee, dessinee),
        // Sans flèche dessinée, le déplacement est une course : c'est le trait
        // neutre du carnet, et la bascule doit éclairer *tous* les déplacements
        // — n'en montrer qu'une partie se lirait comme une panne.
        stroke: dessinee?.stroke ?? 'cut',
      })
    }
    // Immobile ou aux bornes : la valeur exacte du temps, sans interpolation qui ferait trembler.
    if (immobile || part <= 0) return { ...pion, at: { ...pion.at } }
    if (part >= 1) return { ...pion, at: { ...arrivee } }
    return { ...pion, at: avanceSur(chemin(pion.at, arrivee, dessinee), part) }
  })

  const ball = ((): Step['ball'] => {
    if (memeBallon(from.ball, vers.ball)) return structuredClone(from.ball)
    const depart = ouEstLeBallon(from)
    const arrivee = ouEstLeBallon(vers)
    if (!depart || !arrivee) return structuredClone(from.ball)
    // En vol : ni porté, ni posé où il était. Une flèche de passe du porteur courbe le trajet.
    const pass = 'x' in from.ball ? undefined : flecheDe(from.ball.side, from.ball.position, ['pass'])
    const vol = chemin(depart, arrivee, pass)
    // La passe est un déplacement comme un autre, et le coach la montre autant que
    // les courses : elle a droit à sa ligne, en pointillé puisque c'est son trait.
    if (avecLignes && 'x' in from.ball === false) {
      lignes.push({ from: from.ball, points: vol, stroke: 'pass' })
    }
    if (part <= 0) return structuredClone(from.ball)
    if (part >= 1) return structuredClone(vers.ball)
    return avanceSur(vol, part)
  })()

  return { markers, ball, arrows: lignes }
}
