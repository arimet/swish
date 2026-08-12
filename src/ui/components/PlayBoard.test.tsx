import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlayBoard } from './PlayBoard'
import { nouveauSchema } from '../../domain/plays'

const demi = { id: 'x', ...nouveauSchema('c1', 'demi', true) }

describe('PlayBoard', () => {
  it('rend les dix pions et le ballon du temps demandé', () => {
    render(<PlayBoard schema={demi} tempsIndex={0} />)
    // Cinq attaquants numérotés, cinq croix
    ;[1, 2, 3, 4, 5].forEach((n) => expect(screen.getByText(String(n))).toBeInTheDocument())
    ;[1, 2, 3, 4, 5].forEach((n) => expect(screen.getByText(`×${n}`)).toBeInTheDocument())
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
