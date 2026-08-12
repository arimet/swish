import { describe, expect, it } from 'vitest'
import { nouveauSchema, tempsSuivant, reduireTrace, versTerrain, type Schema } from './plays'

describe('nouveauSchema', () => {
  it('pose un 1-2-2 de cinq attaquants, ballon au meneur, sur demi-terrain', () => {
    const s = nouveauSchema('c1', 'demi', false)
    expect(s.temps).toHaveLength(1)
    expect(s.temps[0].pions).toHaveLength(5)
    expect(s.temps[0].pions.every((p) => p.camp === 'attaque')).toBe(true)
    expect(s.temps[0].ballon).toEqual({ camp: 'attaque', poste: 1 })
    // 1-2-2 : le meneur est le plus loin du panier (y le plus grand, ligne de fond en haut)
    const meneur = s.temps[0].pions.find((p) => p.poste === 1)!
    expect(Math.max(...s.temps[0].pions.map((p) => p.at.y))).toBe(meneur.at.y)
  })

  it('ajoute cinq défenseurs, chacun entre son attaquant et le panier', () => {
    const s = nouveauSchema('c1', 'demi', true)
    expect(s.temps[0].pions).toHaveLength(10)
    const att1 = s.temps[0].pions.find((p) => p.camp === 'attaque' && p.poste === 1)!
    const def1 = s.temps[0].pions.find((p) => p.camp === 'defense' && p.poste === 1)!
    // Plus proche du panier (0.5, 0.1125) que son attaquant
    const d = (pt: { x: number; y: number }) => Math.hypot(pt.x - 0.5, pt.y - 0.1125)
    expect(d(def1.at)).toBeLessThan(d(att1.at))
  })

  it('occupe la moitié avant sur terrain complet', () => {
    const s = nouveauSchema('c1', 'complet', true)
    expect(s.temps[0].pions.every((p) => p.at.y <= 0.5)).toBe(true)
  })
})

describe('tempsSuivant', () => {
  it('hérite des positions et du ballon, jamais des flèches', () => {
    const s = nouveauSchema('c1', 'demi', false)
    const t0 = { ...s.temps[0], fleches: [{ depuis: { camp: 'attaque' as const, poste: 1 as const }, points: [{ x: 0.5, y: 0.7 }, { x: 0.4, y: 0.3 }], trait: 'course' as const }] }
    const t1 = tempsSuivant(t0)
    expect(t1.pions).toEqual(t0.pions)
    expect(t1.pions).not.toBe(t0.pions)          // copie, pas la même référence
    expect(t1.ballon).toEqual(t0.ballon)
    expect(t1.fleches).toEqual([])
  })
})

describe('reduireTrace', () => {
  it('garde le coude d’un tracé en L', () => {
    // Un L : descente verticale puis départ horizontal, échantillonné en 41 points
    const pts = [
      ...Array.from({ length: 21 }, (_, i) => ({ x: 0.2, y: 0.2 + i * 0.02 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 0.2 + (i + 1) * 0.02, y: 0.6 })),
    ]
    const r = reduireTrace(pts)
    expect(r.length).toBeLessThanOrEqual(5)
    // Le coude (0.2, 0.6) survit à la réduction
    expect(r.some((p) => Math.hypot(p.x - 0.2, p.y - 0.6) < 0.01)).toBe(true)
    // Les extrémités sont conservées exactement
    expect(r[0]).toEqual(pts[0]); expect(r[r.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('réduit fortement un geste bruité sans le déformer', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ x: 0.1 + i * 0.004, y: 0.5 + Math.sin(i / 8) * 0.001 }))
    const r = reduireTrace(pts)
    expect(r.length).toBeLessThanOrEqual(10)
  })

  it('laisse tel quel un tracé de moins de trois points', () => {
    const pts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }]
    expect(reduireTrace(pts)).toEqual(pts)
  })
})

describe('versTerrain', () => {
  it('remappe demi → complet dans la moitié avant, sans perte', () => {
    const s: Schema = { id: 'x', ...nouveauSchema('c1', 'demi', false) }
    const r = versTerrain(s, 'complet')
    if ('refus' in r) throw new Error(r.refus)
    expect(r.ok.terrain).toBe('complet')
    expect(r.ok.temps[0].pions.every((p) => p.at.y <= 0.5)).toBe(true)
  })

  it('refuse complet → demi quand la moitié arrière est occupée, en nommant l’occupant', () => {
    const s: Schema = { id: 'x', ...nouveauSchema('c1', 'complet', false) }
    s.temps[0].pions[2].at = { x: 0.5, y: 0.8 }   // le poste 3 dans la moitié arrière
    const r = versTerrain(s, 'demi')
    expect('refus' in r && /3/.test(r.refus)).toBe(true)
  })

  it('accepte complet → demi quand tout tient dans la moitié avant', () => {
    const s: Schema = { id: 'x', ...nouveauSchema('c1', 'complet', false) }
    const r = versTerrain(s, 'demi')
    if ('refus' in r) throw new Error(r.refus)
    expect(r.ok.terrain).toBe('demi')
    // aller-retour : on retombe (à l’arrondi près) sur le 1-2-2 du demi-terrain
    const attendu = nouveauSchema('c1', 'demi', false)
    r.ok.temps[0].pions.forEach((p, i) => {
      expect(p.at.x).toBeCloseTo(attendu.temps[0].pions[i].at.x, 6)
      expect(p.at.y).toBeCloseTo(attendu.temps[0].pions[i].at.y, 6)
    })
  })

  it('même terrain : rend le schéma inchangé', () => {
    const s: Schema = { id: 'x', ...nouveauSchema('c1', 'demi', false) }
    const r = versTerrain(s, 'demi')
    expect('ok' in r && r.ok).toEqual(s)
  })
})
