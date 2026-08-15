import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { courtWidth, PlayBoard } from './PlayBoard'
import { newPlay } from '../../domain/plays'

const half = { id: 'x', ...newPlay('c1', 'half', true) }

describe('PlayBoard', () => {
  it('rend les dix pions et le ballon du temps demandé', () => {
    const { container } = render(<PlayBoard schema={half} tempsIndex={0} />)
    // Cinq attaquants, cinq défenseurs, mêmes chiffres de part et d'autre : c'est
    // le marqueur de camp qui les sépare. Les deux ont un disque de même rayon —
    // plein pour l'attaque, ouvert pour la défense —, ce qui les distingue aussi
    // en noir et blanc.
    const numeros = (camp: string) => [...container.querySelectorAll(`[data-marker="${camp}"] text`)].map((t) => t.textContent).sort()
    expect(numeros('offense')).toEqual(['1', '2', '3', '4', '5'])
    expect(numeros('defense')).toEqual(['1', '2', '3', '4', '5'])
    const disque = (camp: string) => [...container.querySelectorAll(`[data-marker="${camp}"] circle`)]
    expect(disque('defense')).toHaveLength(5)
    expect(disque('defense').every((c) => c.getAttribute('r') === disque('offense')[0].getAttribute('r'))).toBe(true)
    // Ouvert contre plein : la défense a un contour, l'attaque n'en a pas.
    expect(disque('defense').every((c) => !!c.getAttribute('stroke'))).toBe(true)
    expect(disque('offense').every((c) => !c.getAttribute('stroke'))).toBe(true)
    expect(screen.getByLabelText('ballon')).toBeInTheDocument()
  })

  it('distingue les quatre traits de flèche', () => {
    const s = { ...half }
    s.temps = [{ ...s.temps[0], arrows: (['cut', 'screen', 'pass', 'dribble'] as const).map((stroke, i) => ({
      from: { side: 'offense' as const, position: (i + 1) as 1|2|3|4|5 }, points: [{ x: 0.1 + i * 0.2, y: 0.7 }, { x: 0.1 + i * 0.2, y: 0.3 }], stroke,
    })) }]
    const { container } = render(<PlayBoard schema={s} tempsIndex={0} />)
    expect(container.querySelectorAll('[data-stroke="cut"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-stroke="screen"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-stroke="pass"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-stroke="dribble"]')).toHaveLength(1)
  })

  it('double la profondeur du viewBox sur terrain complet', () => {
    const s = { id: 'y', ...newPlay('c1', 'full', false) }
    const { container } = render(<PlayBoard schema={s} tempsIndex={0} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1500 2800')
  })
})

describe('courtWidth — la borne du tableau', () => {
  it('borne d’abord par la largeur disponible, dans les quatre cas', () => {
    // La faute mesurée : en édition, 52 % de 812 px de haut valent 422 px. Sans
    // `100%`, un téléphone de 375 px se voyait imposer un terrain plus large que
    // sa colonne, qui se faisait couper à droite. Une hauteur d'écran ne dit rien
    // de la largeur disponible ; il faut les deux, et le plafond en pixels.
    for (const place of ['lecture', 'edition'] as const)
      for (const terrain of ['half', 'full'] as const)
        expect(courtWidth(terrain, place)).toMatch(/^min\(100%, /)
  })

  it('donne au terrain complet, deux fois plus profond, deux fois moins de largeur', () => {
    expect(courtWidth('half', 'edition')).toBe('min(100%, 52vh, 560px)')
    expect(courtWidth('full', 'edition')).toBe('min(100%, 26vh, 280px)')
    expect(courtWidth('half')).toBe('min(100%, 77vh, 840px)')
    expect(courtWidth('full')).toBe('min(100%, 38.5vh, 420px)')
  })
})
