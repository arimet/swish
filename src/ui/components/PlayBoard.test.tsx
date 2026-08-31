import { render, screen } from '../../test/render'
import { describe, expect, it } from 'vitest'
import { courtWidth, PlayBoard } from './PlayBoard'
import { newPlay } from '../../domain/plays'

const half = { id: 'x', ...newPlay('c1', 'half', true) }

describe('PlayBoard', () => {
  it('renders the ten markers and the ball of the step asked for', () => {
    const { container } = render(<PlayBoard play={half} stepIndex={0} />)
    // Five attackers, five defenders, the same digits on either side: it is the side
    // marker that separates them. Both have a disc of the same radius — filled for the
    // attack, open for the defence — which also tells them apart
    // en noir et blanc.
    const numeros = (camp: string) => [...container.querySelectorAll(`[data-marker="${camp}"] text`)].map((t) => t.textContent).sort()
    expect(numeros('offense')).toEqual(['1', '2', '3', '4', '5'])
    expect(numeros('defense')).toEqual(['1', '2', '3', '4', '5'])
    const disc = (camp: string) => [...container.querySelectorAll(`[data-marker="${camp}"] circle`)]
    expect(disc('defense')).toHaveLength(5)
    expect(disc('defense').every((c) => c.getAttribute('r') === disc('offense')[0].getAttribute('r'))).toBe(true)
    // Open against filled: the defence has a stroke, the attack has none.
    expect(disc('defense').every((c) => !!c.getAttribute('stroke'))).toBe(true)
    expect(disc('offense').every((c) => !c.getAttribute('stroke'))).toBe(true)
    expect(screen.getByLabelText('ballon')).toBeInTheDocument()
  })

  it('tells the four arrow strokes apart', () => {
    const s = { ...half }
    s.steps = [{ ...s.steps[0], arrows: (['cut', 'screen', 'pass', 'dribble'] as const).map((stroke, i) => ({
      from: { side: 'offense' as const, position: (i + 1) as 1|2|3|4|5 }, points: [{ x: 0.1 + i * 0.2, y: 0.7 }, { x: 0.1 + i * 0.2, y: 0.3 }], stroke,
    })) }]
    const { container } = render(<PlayBoard play={s} stepIndex={0} />)
    expect(container.querySelectorAll('[data-stroke="cut"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-stroke="screen"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-stroke="pass"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-stroke="dribble"]')).toHaveLength(1)
  })

  it('doubles the viewBox\'s depth on a full court', () => {
    const s = { id: 'y', ...newPlay('c1', 'full', false) }
    const { container } = render(<PlayBoard play={s} stepIndex={0} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1500 2800')
  })
})

describe('courtWidth — the board\'s bound', () => {
  it('bounds by the width available first, in all four cases', () => {
    // The measured fault: in editing, 52% of 812 px of height is 422 px. Without
    // `100%`, a 375 px phone was handed a court wider than its column, which got
    // clipped on the right. A screen's height says nothing about the width available;
    // both are needed, plus the pixel ceiling.
    for (const place of ['lecture', 'edition'] as const)
      for (const terrain of ['half', 'full'] as const)
        expect(courtWidth(terrain, place)).toMatch(/^min\(100%, /)
  })

  it('gives the full court, twice as deep, half the width', () => {
    expect(courtWidth('half', 'edition')).toBe('min(100%, 52vh, 560px)')
    expect(courtWidth('full', 'edition')).toBe('min(100%, 26vh, 280px)')
    expect(courtWidth('half')).toBe('min(100%, 77vh, 840px)')
    expect(courtWidth('full')).toBe('min(100%, 38.5vh, 420px)')
  })
})
