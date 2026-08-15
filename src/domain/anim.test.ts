import { describe, expect, it } from 'vitest'
import { snapshot, recaler, transitions } from './anim'
import { newPlay, nextStep, type Play } from './plays'

const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6)
}

describe('recaler', () => {
  it('fait tomber les extrémités exactement sur le départ et l’arrivée', () => {
    const trace = [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.6 }, { x: 0.6, y: 0.6 }]
    const r = recaler(trace, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.5 })
    proche(r[0], { x: 0.1, y: 0.1 })
    proche(r[r.length - 1], { x: 0.9, y: 0.5 })
  })

  it('préserve la forme : un L reste un L', () => {
    // Le coude est à angle droit ; une fitTo conserve les angles.
    const trace = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
    const r = recaler(trace, { x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 })
    const u = { x: r[0].x - r[1].x, y: r[0].y - r[1].y }
    const v = { x: r[2].x - r[1].x, y: r[2].y - r[1].y }
    expect(u.x * v.x + u.y * v.y).toBeCloseTo(0, 6)   // produit scalaire nul
  })

  it('conserve les proportions le long du tracé', () => {
    // Le milieu d’un segment droit reste au milieu après recalage.
    const trace = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }]
    const r = recaler(trace, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 })
    proche(r[1], { x: 0.5, y: 0.5 })
  })

  it('retombe sur la ligne droite quand le tracé est dégénéré', () => {
    // Extrémités confondues : aucune fitTo n’est définie.
    const trace = [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.5 }, { x: 0.3, y: 0.3 }]
    const r = recaler(trace, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })
    expect(r).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])
  })

  it('laisse tel quel un tracé de moins de deux points, ramené aux bornes', () => {
    expect(recaler([], { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])
  })
})

/** Deux temps : le poste 1 descend de (0.5,0.62) à (0.5,0.2), les autres ne bougent pas. */
function deuxTemps(): Play {
  const s: Play = { id: 'x', ...newPlay('c1', 'half', false) }
  const t1 = nextStep(s.temps[0])
  t1.markers = t1.markers.map((p) => (p.position === 1 ? { ...p, at: { x: 0.5, y: 0.2 } } : p))
  s.temps = [s.temps[0], t1]
  return s
}

describe('snapshot', () => {
  it('rend exactement le temps de départ à part 0, et le suivant à part 1', () => {
    const s = deuxTemps()
    expect(snapshot(s, { temps: 0, part: 0 }).markers).toEqual(s.temps[0].markers)
    expect(snapshot(s, { temps: 0, part: 1 }).markers).toEqual(s.temps[1].markers)
  })

  it('interpole en ligne droite le pion sans flèche', () => {
    const s = deuxTemps()
    const p = snapshot(s, { temps: 0, part: 0.5 }).markers.find((q) => q.position === 1)!
    expect(p.at.x).toBeCloseTo(0.5, 6)
    expect(p.at.y).toBeCloseTo(0.41, 6)          // (0.62 + 0.2) / 2
  })

  it('laisse strictement immobile un pion qui ne bouge pas', () => {
    const s = deuxTemps()
    const avant = s.temps[0].markers.find((q) => q.position === 3)!
    const p = snapshot(s, { temps: 0, part: 0.37 }).markers.find((q) => q.position === 3)!
    expect(p.at).toEqual(avant.at)
  })

  it('laisse strictement immobile un pion immobile malgré sa flèche', () => {
    // Le tracé recalé sur deux positions confondues est de longueur nulle : le
    // pion doit rester posé là, pas partir en NaN.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 3 },
      points: [{ x: 0.78, y: 0.48 }, { x: 0.6, y: 0.4 }, { x: 0.78, y: 0.48 }],
      stroke: 'screen',
    }] }
    const avant = s.temps[0].markers.find((q) => q.position === 3)!
    const p = snapshot(s, { temps: 0, part: 0.37 }).markers.find((q) => q.position === 3)!
    expect(p.at).toEqual(avant.at)
  })

  it('suit la forme de la flèche plutôt que la corde', () => {
    // Une course qui contourne par la gauche : à mi-chemin, le pion est à l’écart
    // de la ligne droite qui joint les deux positions.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.2, y: 0.41 }, { x: 0.5, y: 0.2 }],
      stroke: 'cut',
    }] }
    const p = snapshot(s, { temps: 0, part: 0.5 }).markers.find((q) => q.position === 1)!
    expect(p.at.x).toBeLessThan(0.4)             // nettement à gauche de la corde
  })

  it('recale la flèche : un tracé dessiné à côté mène quand même aux positions réelles', () => {
    // La flèche part de (0.3,0.7) et finit en (0.3,0.25) — nulle part près du
    // pion. Suivre le tracé brut ferait démarrer et arriver le pion à côté.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.3, y: 0.7 }, { x: 0.1, y: 0.45 }, { x: 0.3, y: 0.25 }],
      stroke: 'cut',
    }] }
    const tout = (part: number) => snapshot(s, { temps: 0, part }).markers.find((q) => q.position === 1)!.at
    expect(Math.hypot(tout(0.01).x - 0.5, tout(0.01).y - 0.62)).toBeLessThan(0.03)
    expect(Math.hypot(tout(0.99).x - 0.5, tout(0.99).y - 0.2)).toBeLessThan(0.03)
  })

  it('avance à vitesse constante, quelle que soit la densité des points du tracé', () => {
    // Tracé droit mais échantillonné serré au départ : paramétrer par le rang
    // des points ferait ramper le pion au début puis bondir à la fin.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.6 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.2 }],
      stroke: 'cut',
    }] }
    const p = snapshot(s, { temps: 0, part: 0.5 }).markers.find((q) => q.position === 1)!
    expect(p.at.y).toBeCloseTo(0.41, 6)          // la moitié de la longueur, pas le point de rang 1,5
  })

  it('n’expose aucune flèche : l’animation montre les joueurs, pas les traits', () => {
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 1 }, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }], stroke: 'cut',
    }] }
    expect(snapshot(s, { temps: 0, part: 0.5 }).arrows).toEqual([])
  })

  it('mène le ballon au nouveau porteur quand il change de mains', () => {
    const s = deuxTemps()
    s.temps[1] = { ...s.temps[1], ball: { side: 'offense', position: 3 } }
    const mi = snapshot(s, { temps: 0, part: 0.5 })
    const start = s.temps[0].markers.find((q) => q.position === 1)!.at
    const end = s.temps[1].markers.find((q) => q.position === 3)!.at
    // Le ballon est en vol : posé au sol, à mi-distance des deux porteurs.
    expect('x' in mi.ball).toBe(true)
    const b = mi.ball as { x: number; y: number }
    expect(b.x).toBeCloseTo((start.x + end.x) / 2, 6)
  })

  it('fait suivre au ballon la flèche de passe, pas la corde', () => {
    const s = deuxTemps()
    s.temps[1] = { ...s.temps[1], ball: { side: 'offense', position: 3 } }
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.6, y: 0.9 }, { x: 0.78, y: 0.48 }],  // une cloche
      stroke: 'pass',
    }] }
    const b = snapshot(s, { temps: 0, part: 0.5 }).ball as { x: number; y: number }
    expect(b.y).toBeGreaterThan(0.7)             // haut de la cloche, loin de la corde
  })

  it('garde le ballon porté quand le porteur ne change pas', () => {
    const s = deuxTemps()
    expect(snapshot(s, { temps: 0, part: 0.5 }).ball).toEqual({ side: 'offense', position: 1 })
  })

  it('compte les transitions, et rend le dernier temps au-delà', () => {
    const s = deuxTemps()
    expect(transitions(s)).toBe(1)
    expect(snapshot(s, { temps: 5, part: 0.5 }).markers).toEqual(s.temps[1].markers)
  })
})

/**
 * Les lines de déplacement, en option : ce que le coach voit du path pendant
 * que la combinaison se joue.
 *
 * Le contrat tient en une phrase : la ligne est le path **réellement suivi**.
 * Elle n'est donc pas la flèche dessinée — c'est cette flèche recalée sur les
 * positions des deux temps, la même courbe que celle qui porte le pion. Une
 * ligne qui divergerait du mouvement serait pire que pas de ligne.
 */
describe('snapshot — les lines de déplacement', () => {
  const ligneDe = (s: Play, part: number, position: number) =>
    snapshot(s, { temps: 0, part }, true).arrows.find((f) => f.from.position === position)

  it('n’émet aucune ligne quand on ne les demande pas', () => {
    // Le comportement historique : l'animation nue. C'est encore le défaut.
    const s = deuxTemps()
    expect(snapshot(s, { temps: 0, part: 0.5 }).arrows).toEqual([])
  })

  it('mène de la position de départ à celle d’arrivée', () => {
    const s = deuxTemps()
    const l = ligneDe(s, 0.5, 1)!
    proche(l.points[0], { x: 0.5, y: 0.62 })
    proche(l.points[l.points.length - 1], { x: 0.5, y: 0.2 })
  })

  it('reste la même sur toute la transition : c’est un path, pas une traînée', () => {
    // La ligne ne se dessine pas au fur et à mesure. À 10 % comme à 90 %, elle
    // montre le chemin entier — c'est ce qu'on montre du doigt au temps-mort.
    const s = deuxTemps()
    expect(ligneDe(s, 0.1, 1)!.points).toEqual(ligneDe(s, 0.9, 1)!.points)
  })

  it('emprunte la forme de la flèche dessinée, recalée', () => {
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], arrows: [{
      from: { side: 'offense', position: 1 },
      points: [{ x: 0.3, y: 0.7 }, { x: 0.1, y: 0.45 }, { x: 0.3, y: 0.25 }],   // dessinée à côté
      stroke: 'cut',
    }] }
    const l = ligneDe(s, 0.5, 1)!
    // Extrémités recalées sur les vraies positions…
    proche(l.points[0], { x: 0.5, y: 0.62 })
    proche(l.points[l.points.length - 1], { x: 0.5, y: 0.2 })
    // …et le ventre du contournement conservé, donc à l'écart de la corde.
    expect(Math.min(...l.points.map((p) => p.x))).toBeLessThan(0.45)
    expect(l.stroke).toBe('cut')
  })

  it('donne une droite au pion qui bouge sans flèche dessinée', () => {
    // Sinon la bascule éclairerait certains déplacements et pas d'autres, ce qui
    // se lit comme une panne plutôt que comme une règle.
    const s = deuxTemps()
    const l = ligneDe(s, 0.5, 1)!
    expect(l.points).toEqual([{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }])
    expect(l.stroke).toBe('cut')
  })

  it('ignore les pions immobiles', () => {
    const s = deuxTemps()
    expect(ligneDe(s, 0.5, 3)).toBeUndefined()
  })

  it('trace la passe quand le ballon change de mains', () => {
    const s = deuxTemps()
    s.temps[1] = { ...s.temps[1], ball: { side: 'offense', position: 3 } }
    const pass = snapshot(s, { temps: 0, part: 0.5 }, true).arrows.find((f) => f.stroke === 'pass')!
    expect(pass).toBeDefined()
    proche(pass.points[0], { x: 0.5, y: 0.62 })          // le porteur au départ
    proche(pass.points[pass.points.length - 1], { x: 0.78, y: 0.48 })   // le receveur
  })

  it('ne trace pas de passe quand le ballon ne change pas de mains', () => {
    const s = deuxTemps()
    expect(snapshot(s, { temps: 0, part: 0.5 }, true).arrows.some((f) => f.stroke === 'pass')).toBe(false)
  })

  it('n’émet rien sur le dernier temps, qui n’a pas de suite', () => {
    const s = deuxTemps()
    expect(snapshot(s, { temps: 1, part: 0 }, true).arrows).toEqual([])
  })

  it('montre le path dès le premier instant, avant que rien n’ait bougé', () => {
    // À part 0 les pions sont encore aux positions dessinées, mais la ligne doit
    // déjà être là : elle annonce le geste, elle ne le commente pas après coup.
    const s = deuxTemps()
    expect(ligneDe(s, 0, 1)).toBeDefined()
  })
})
