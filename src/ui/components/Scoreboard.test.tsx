import { render, screen } from '../../test/render'
import { describe, expect, it } from 'vitest'
import { ScoreSide } from './Scoreboard'

/**
 * The product's only authored motion: the score acknowledges the gesture that changed
 * it, and it says *in which direction*.
 *
 * What is tested here is not the animation — a browser plays it, jsdom does not — but
 * the **decision**: which class is applied, when, and above all when it is not. That
 * last point matters most: the scorer's table re-renders once a second because of the
 * clock, and a motion that re-triggered on the tick would be a permanent flicker next
 * to the number that
 * cinq personnes regardent.
 */
const mount = (score: number) =>
  render(<ScoreSide align="right" color="#fff" name="VIGNOT" score={score} lead />)

const shown = (value: number) => screen.getByText(String(value))

describe('ScoreSide — the score\'s acknowledgement', () => {
  it('does not move on the first render', () => {
    // At opening, the score has not changed: it was already there. A loading
    // choreography has no business on a recording screen.
    mount(38)
    expect(shown(38).className).not.toMatch(/score-(up|down)/)
  })

  it('rises when someone scores', () => {
    const { rerender } = mount(38)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={40} lead />)
    expect(shown(40)).toHaveClass('score-up')
  })

  it('falls when someone undoes', () => {
    // An undo that read as a basket would be worse than no motion at all.
    const { rerender } = mount(40)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={38} lead />)
    expect(shown(38)).toHaveClass('score-down')
  })

  it('does not re-trigger when the score does not change', () => {
    // The clock-tick case: the parent re-renders, the score is the same. The node must
    // be the *same* node — otherwise the browser would replay the keyframe.
    const { rerender } = mount(38)
    const avant = shown(38)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={38} lead={false} />)
    expect(shown(38)).toBe(avant)
  })

  it('replays the motion on every basket, even of the same value', () => {
    // Two free throws in a row: the node must be replaced both times,
    // sinon le second panier passerait inaperçu.
    const { rerender } = mount(38)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={39} lead />)
    const premier = shown(39)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={40} lead />)
    expect(shown(40)).not.toBe(premier)
    expect(shown(40)).toHaveClass('score-up')
  })
})
