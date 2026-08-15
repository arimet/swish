import { describe, expect, it } from 'vitest'
import { folders, newPlay, nextStep, simplifyPath, toCourt, type Play } from './plays'

describe('nouveauSchema', () => {
  it('pose un 1-2-2 de cinq attaquants, ballon au meneur, sur demi-terrain', () => {
    const s = newPlay('c1', 'half', false)
    expect(s.temps).toHaveLength(1)
    expect(s.temps[0].markers).toHaveLength(5)
    expect(s.temps[0].markers.every((p) => p.side === 'offense')).toBe(true)
    expect(s.temps[0].ball).toEqual({ side: 'offense', position: 1 })
    // 1-2-2 : le meneur est le plus loin du panier (y le plus grand, ligne de fond en haut)
    const meneur = s.temps[0].markers.find((p) => p.position === 1)!
    expect(Math.max(...s.temps[0].markers.map((p) => p.at.y))).toBe(meneur.at.y)
  })

  it('ajoute cinq défenseurs, chacun entre son attaquant et le panier', () => {
    const s = newPlay('c1', 'half', true)
    expect(s.temps[0].markers).toHaveLength(10)
    const att1 = s.temps[0].markers.find((p) => p.side === 'offense' && p.position === 1)!
    const def1 = s.temps[0].markers.find((p) => p.side === 'defense' && p.position === 1)!
    // Plus proche du panier (0.5, 0.1125) que son attaquant
    const d = (pt: { x: number; y: number }) => Math.hypot(pt.x - 0.5, pt.y - 0.1125)
    expect(d(def1.at)).toBeLessThan(d(att1.at))
  })

  it('occupe la moitié avant sur terrain complet', () => {
    const s = newPlay('c1', 'full', true)
    expect(s.temps[0].markers.every((p) => p.at.y <= 0.5)).toBe(true)
  })
})

describe('tempsSuivant', () => {
  it('hérite des positions et du ballon, jamais des flèches', () => {
    const s = newPlay('c1', 'half', false)
    const t0 = { ...s.temps[0], arrows: [{ from: { side: 'offense' as const, position: 1 as const }, points: [{ x: 0.5, y: 0.7 }, { x: 0.4, y: 0.3 }], stroke: 'cut' as const }] }
    const t1 = nextStep(t0)
    expect(t1.markers).toEqual(t0.markers)
    expect(t1.markers).not.toBe(t0.markers)          // copie, pas la même référence
    expect(t1.ball).toEqual(t0.ball)
    expect(t1.arrows).toEqual([])
  })
})

describe('reduireTrace', () => {
  it('garde le coude d’un tracé en L', () => {
    // Un L : descente verticale puis départ horizontal, échantillonné en 41 points
    const pts = [
      ...Array.from({ length: 21 }, (_, i) => ({ x: 0.2, y: 0.2 + i * 0.02 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 0.2 + (i + 1) * 0.02, y: 0.6 })),
    ]
    const r = simplifyPath(pts)
    expect(r.length).toBeLessThanOrEqual(5)
    // Le coude (0.2, 0.6) survit à la réduction
    expect(r.some((p) => Math.hypot(p.x - 0.2, p.y - 0.6) < 0.01)).toBe(true)
    // Les extrémités sont conservées exactement
    expect(r[0]).toEqual(pts[0]); expect(r[r.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('réduit fortement un geste bruité sans le déformer', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ x: 0.1 + i * 0.004, y: 0.5 + Math.sin(i / 8) * 0.001 }))
    const r = simplifyPath(pts)
    expect(r.length).toBeLessThanOrEqual(10)
  })

  it('laisse tel quel un tracé de moins de trois points', () => {
    const pts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }]
    expect(simplifyPath(pts)).toEqual(pts)
  })
})

describe('versTerrain', () => {
  it('remappe demi → complet dans la moitié avant, sans perte', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'half', false) }
    const r = toCourt(s, 'full')
    if ('refus' in r) throw new Error(r.refus.cle)
    expect(r.ok.court).toBe('full')
    expect(r.ok.temps[0].markers.every((p) => p.at.y <= 0.5)).toBe(true)
  })

  it('refuse complet → demi quand la moitié arrière est occupée, en nommant l’occupant', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'full', false) }
    s.temps[0].markers[2].at = { x: 0.5, y: 0.8 }   // le poste 3 dans la moitié arrière
    const r = toCourt(s, 'half')
    expect('refus' in r && r.refus).toEqual({ cle: 'sch.occPoste', n: 3 })
  })

  it('accepte complet → demi quand tout tient dans la moitié avant', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'full', false) }
    const r = toCourt(s, 'half')
    if ('refus' in r) throw new Error(r.refus.cle)
    expect(r.ok.court).toBe('half')
    // aller-retour : on retombe (à l’arrondi près) sur le 1-2-2 du demi-terrain
    const attendu = newPlay('c1', 'half', false)
    r.ok.temps[0].markers.forEach((p, i) => {
      expect(p.at.x).toBeCloseTo(attendu.temps[0].markers[i].at.x, 6)
      expect(p.at.y).toBeCloseTo(attendu.temps[0].markers[i].at.y, 6)
    })
  })

  it('même terrain : rend le schéma inchangé', () => {
    const s: Play = { id: 'x', ...newPlay('c1', 'half', false) }
    const r = toCourt(s, 'half')
    expect('ok' in r && r.ok).toEqual(s)
  })
})

describe('dossiers', () => {
  it('déduit la liste des dossiers des schémas, triée et sans doublon', () => {
    const s = (nom: string, folder?: string): Play => ({ id: nom, ...newPlay('c1', 'half', false), nom, folder })
    expect(folders([s('a', 'Remises en jeu'), s('b', 'Attaque placée'), s('c', 'Remises en jeu'), s('d')]))
      .toEqual(['Attaque placée', 'Remises en jeu'])
  })

  it('ne rend aucun dossier quand aucun schéma n’en déclare', () => {
    const s: Play = { id: 'a', ...newPlay('c1', 'half', false) }
    expect(folders([s])).toEqual([])
  })
})
