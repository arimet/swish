import { describe, expect, it } from 'vitest'
import { instantane, recaler, transitions } from './anim'
import { nouveauSchema, tempsSuivant, type Schema } from './plays'

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
    // Le coude est à angle droit ; une similitude conserve les angles.
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
    // Extrémités confondues : aucune similitude n’est définie.
    const trace = [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.5 }, { x: 0.3, y: 0.3 }]
    const r = recaler(trace, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })
    expect(r).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])
  })

  it('laisse tel quel un tracé de moins de deux points, ramené aux bornes', () => {
    expect(recaler([], { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])
  })
})

/** Deux temps : le poste 1 descend de (0.5,0.62) à (0.5,0.2), les autres ne bougent pas. */
function deuxTemps(): Schema {
  const s: Schema = { id: 'x', ...nouveauSchema('c1', 'demi', false) }
  const t1 = tempsSuivant(s.temps[0])
  t1.pions = t1.pions.map((p) => (p.poste === 1 ? { ...p, at: { x: 0.5, y: 0.2 } } : p))
  s.temps = [s.temps[0], t1]
  return s
}

describe('instantane', () => {
  it('rend exactement le temps de départ à part 0, et le suivant à part 1', () => {
    const s = deuxTemps()
    expect(instantane(s, { temps: 0, part: 0 }).pions).toEqual(s.temps[0].pions)
    expect(instantane(s, { temps: 0, part: 1 }).pions).toEqual(s.temps[1].pions)
  })

  it('interpole en ligne droite le pion sans flèche', () => {
    const s = deuxTemps()
    const p = instantane(s, { temps: 0, part: 0.5 }).pions.find((q) => q.poste === 1)!
    expect(p.at.x).toBeCloseTo(0.5, 6)
    expect(p.at.y).toBeCloseTo(0.41, 6)          // (0.62 + 0.2) / 2
  })

  it('laisse strictement immobile un pion qui ne bouge pas', () => {
    const s = deuxTemps()
    const avant = s.temps[0].pions.find((q) => q.poste === 3)!
    const p = instantane(s, { temps: 0, part: 0.37 }).pions.find((q) => q.poste === 3)!
    expect(p.at).toEqual(avant.at)
  })

  it('laisse strictement immobile un pion immobile malgré sa flèche', () => {
    // Le tracé recalé sur deux positions confondues est de longueur nulle : le
    // pion doit rester posé là, pas partir en NaN.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], fleches: [{
      depuis: { camp: 'attaque', poste: 3 },
      points: [{ x: 0.78, y: 0.48 }, { x: 0.6, y: 0.4 }, { x: 0.78, y: 0.48 }],
      trait: 'ecran',
    }] }
    const avant = s.temps[0].pions.find((q) => q.poste === 3)!
    const p = instantane(s, { temps: 0, part: 0.37 }).pions.find((q) => q.poste === 3)!
    expect(p.at).toEqual(avant.at)
  })

  it('suit la forme de la flèche plutôt que la corde', () => {
    // Une course qui contourne par la gauche : à mi-chemin, le pion est à l’écart
    // de la ligne droite qui joint les deux positions.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], fleches: [{
      depuis: { camp: 'attaque', poste: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.2, y: 0.41 }, { x: 0.5, y: 0.2 }],
      trait: 'course',
    }] }
    const p = instantane(s, { temps: 0, part: 0.5 }).pions.find((q) => q.poste === 1)!
    expect(p.at.x).toBeLessThan(0.4)             // nettement à gauche de la corde
  })

  it('recale la flèche : un tracé dessiné à côté mène quand même aux positions réelles', () => {
    // La flèche part de (0.3,0.7) et finit en (0.3,0.25) — nulle part près du
    // pion. Suivre le tracé brut ferait démarrer et arriver le pion à côté.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], fleches: [{
      depuis: { camp: 'attaque', poste: 1 },
      points: [{ x: 0.3, y: 0.7 }, { x: 0.1, y: 0.45 }, { x: 0.3, y: 0.25 }],
      trait: 'course',
    }] }
    const tout = (part: number) => instantane(s, { temps: 0, part }).pions.find((q) => q.poste === 1)!.at
    expect(Math.hypot(tout(0.01).x - 0.5, tout(0.01).y - 0.62)).toBeLessThan(0.03)
    expect(Math.hypot(tout(0.99).x - 0.5, tout(0.99).y - 0.2)).toBeLessThan(0.03)
  })

  it('avance à vitesse constante, quelle que soit la densité des points du tracé', () => {
    // Tracé droit mais échantillonné serré au départ : paramétrer par le rang
    // des points ferait ramper le pion au début puis bondir à la fin.
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], fleches: [{
      depuis: { camp: 'attaque', poste: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.6 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.2 }],
      trait: 'course',
    }] }
    const p = instantane(s, { temps: 0, part: 0.5 }).pions.find((q) => q.poste === 1)!
    expect(p.at.y).toBeCloseTo(0.41, 6)          // la moitié de la longueur, pas le point de rang 1,5
  })

  it('n’expose aucune flèche : l’animation montre les joueurs, pas les traits', () => {
    const s = deuxTemps()
    s.temps[0] = { ...s.temps[0], fleches: [{
      depuis: { camp: 'attaque', poste: 1 }, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }], trait: 'course',
    }] }
    expect(instantane(s, { temps: 0, part: 0.5 }).fleches).toEqual([])
  })

  it('mène le ballon au nouveau porteur quand il change de mains', () => {
    const s = deuxTemps()
    s.temps[1] = { ...s.temps[1], ballon: { camp: 'attaque', poste: 3 } }
    const mi = instantane(s, { temps: 0, part: 0.5 })
    const depart = s.temps[0].pions.find((q) => q.poste === 1)!.at
    const arrivee = s.temps[1].pions.find((q) => q.poste === 3)!.at
    // Le ballon est en vol : posé au sol, à mi-distance des deux porteurs.
    expect('x' in mi.ballon).toBe(true)
    const b = mi.ballon as { x: number; y: number }
    expect(b.x).toBeCloseTo((depart.x + arrivee.x) / 2, 6)
  })

  it('fait suivre au ballon la flèche de passe, pas la corde', () => {
    const s = deuxTemps()
    s.temps[1] = { ...s.temps[1], ballon: { camp: 'attaque', poste: 3 } }
    s.temps[0] = { ...s.temps[0], fleches: [{
      depuis: { camp: 'attaque', poste: 1 },
      points: [{ x: 0.5, y: 0.62 }, { x: 0.6, y: 0.9 }, { x: 0.78, y: 0.48 }],  // une cloche
      trait: 'passe',
    }] }
    const b = instantane(s, { temps: 0, part: 0.5 }).ballon as { x: number; y: number }
    expect(b.y).toBeGreaterThan(0.7)             // haut de la cloche, loin de la corde
  })

  it('garde le ballon porté quand le porteur ne change pas', () => {
    const s = deuxTemps()
    expect(instantane(s, { temps: 0, part: 0.5 }).ballon).toEqual({ camp: 'attaque', poste: 1 })
  })

  it('compte les transitions, et rend le dernier temps au-delà', () => {
    const s = deuxTemps()
    expect(transitions(s)).toBe(1)
    expect(instantane(s, { temps: 5, part: 0.5 }).pions).toEqual(s.temps[1].pions)
  })
})
