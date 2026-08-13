import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { largeurTerrain, PlayBoard } from './PlayBoard'
import { nouveauSchema } from '../../domain/plays'

const demi = { id: 'x', ...nouveauSchema('c1', 'demi', true) }

describe('PlayBoard', () => {
  it('rend les dix pions et le ballon du temps demandé', () => {
    const { container } = render(<PlayBoard schema={demi} tempsIndex={0} />)
    // Cinq attaquants, cinq défenseurs, mêmes chiffres de part et d'autre : c'est
    // le marqueur de camp qui les sépare. Les deux ont un disque de même rayon —
    // plein pour l'attaque, ouvert pour la défense —, ce qui les distingue aussi
    // en noir et blanc.
    const numeros = (camp: string) => [...container.querySelectorAll(`[data-pion="${camp}"] text`)].map((t) => t.textContent).sort()
    expect(numeros('attaque')).toEqual(['1', '2', '3', '4', '5'])
    expect(numeros('defense')).toEqual(['1', '2', '3', '4', '5'])
    const disque = (camp: string) => [...container.querySelectorAll(`[data-pion="${camp}"] circle`)]
    expect(disque('defense')).toHaveLength(5)
    expect(disque('defense').every((c) => c.getAttribute('r') === disque('attaque')[0].getAttribute('r'))).toBe(true)
    // Ouvert contre plein : la défense a un contour, l'attaque n'en a pas.
    expect(disque('defense').every((c) => !!c.getAttribute('stroke'))).toBe(true)
    expect(disque('attaque').every((c) => !c.getAttribute('stroke'))).toBe(true)
    expect(screen.getByLabelText('ballon')).toBeInTheDocument()
  })

  it('distingue les quatre traits de flèche', () => {
    const s = { ...demi }
    s.temps = [{ ...s.temps[0], fleches: (['course', 'ecran', 'passe', 'dribble'] as const).map((trait, i) => ({
      depuis: { camp: 'attaque' as const, poste: (i + 1) as 1|2|3|4|5 }, points: [{ x: 0.1 + i * 0.2, y: 0.7 }, { x: 0.1 + i * 0.2, y: 0.3 }], trait,
    })) }]
    const { container } = render(<PlayBoard schema={s} tempsIndex={0} />)
    expect(container.querySelectorAll('[data-trait="course"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-trait="ecran"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-trait="passe"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-trait="dribble"]')).toHaveLength(1)
  })

  it('double la profondeur du viewBox sur terrain complet', () => {
    const s = { id: 'y', ...nouveauSchema('c1', 'complet', false) }
    const { container } = render(<PlayBoard schema={s} tempsIndex={0} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1500 2800')
  })
})

describe('largeurTerrain — la borne du tableau', () => {
  it('borne d’abord par la largeur disponible, dans les quatre cas', () => {
    // La faute mesurée : en édition, 52 % de 812 px de haut valent 422 px. Sans
    // `100%`, un téléphone de 375 px se voyait imposer un terrain plus large que
    // sa colonne, qui se faisait couper à droite. Une hauteur d'écran ne dit rien
    // de la largeur disponible ; il faut les deux, et le plafond en pixels.
    for (const place of ['lecture', 'edition'] as const)
      for (const terrain of ['demi', 'complet'] as const)
        expect(largeurTerrain(terrain, place)).toMatch(/^min\(100%, /)
  })

  it('donne au terrain complet, deux fois plus profond, deux fois moins de largeur', () => {
    expect(largeurTerrain('demi', 'edition')).toBe('min(100%, 52vh, 560px)')
    expect(largeurTerrain('complet', 'edition')).toBe('min(100%, 26vh, 280px)')
    expect(largeurTerrain('demi')).toBe('min(100%, 77vh, 840px)')
    expect(largeurTerrain('complet')).toBe('min(100%, 38.5vh, 420px)')
  })
})
