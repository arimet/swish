/**
 * Le domaine de l'animation : où est chaque chose à l'instant t ?
 *
 * Une flèche est un dessin, pas une trajectoire — rien dans le modèle de 8A ne
 * relie le bout d'un tracé à la position du pion au temps suivant. On interpole
 * donc entre les positions des temps, la seule paire dont le modèle garantisse
 * la cohérence, et la flèche ne sert qu'à courber le trajet après recalage.
 */
import type { Point } from './plays'

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
