import { describe, expect, it } from 'vitest'
import { recaler } from './anim'

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
