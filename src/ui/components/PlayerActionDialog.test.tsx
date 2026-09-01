import { render, screen, fireEvent, act } from '../../test/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerActionDialog } from './PlayerActionDialog'
import { SHOT_FEEDBACK_MS } from './ShotCourt'

const noop = vi.fn()

function renderDialog(over: Partial<Parameters<typeof PlayerActionDialog>[0]> = {}) {
  const props = {
    open: true, playerName: '4 ROUX',
    onClose: vi.fn(), onScore: vi.fn(), onMiss: vi.fn(), onFoul: noop, onStat: noop,
    onRemoveScore: noop, onRemoveFoul: noop, onRemoveStat: noop, onRemoveMiss: noop,
    ...over,
  }
  render(<PlayerActionDialog {...props} />)
  return props
}

const court = () => screen.getByLabelText('Demi-terrain — toucher le point de tir')

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom computes no layout: we pin the SVG's box to 300×280.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('PlayerActionDialog — recording a shot', () => {
  it('records a single shot even if the court is touched twice', () => {
    const { onScore } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    fireEvent.click(court(), { clientX: 40, clientY: 200 })
    expect(onScore).toHaveBeenCalledTimes(1)
  })

  it('shows the points and the zone before closing', () => {
    const { onClose } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(SHOT_FEEDBACK_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('announces a missed shot without counting points', () => {
    const { onScore, onMiss } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Manqué' }))
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(onScore).not.toHaveBeenCalled()
    expect(onMiss).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('MANQUÉ · Raquette')
  })
})

/**
 * The foul, and its side of the ball.
 *
 * What a table calls out is offensive, defensive or technical — and it calls it out
 * while looking at the court. Hence three buttons rather than one button and a picker:
 * the type is recorded without costing a second tap. A single "Personal foul" button
 * would file every foul in the database under the same unspecified type.
 */
describe('PlayerActionDialog — the foul and its type', () => {
  it('records each of the three types in one tap', () => {
    for (const [aria, expected] of [
      ['Faute offensive', 'offensive'],
      ['Faute défensive', 'defensive'],
      ['Faute technique', 'technical'],
    ] as const) {
      const onFoul = vi.fn()
      const { unmount } = render(
        <PlayerActionDialog open playerName="4 ROUX"
          onClose={vi.fn()} onScore={vi.fn()} onMiss={vi.fn()} onFoul={onFoul} onStat={noop}
          onRemoveScore={noop} onRemoveFoul={noop} onRemoveStat={noop} onRemoveMiss={noop} />,
      )
      fireEvent.click(screen.getByRole('button', { name: aria }))
      expect(onFoul).toHaveBeenCalledWith(expected)
      unmount()
    }
  })

  it('closes on the foul, like every other entry', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Faute offensive' }))
    expect(onClose).toHaveBeenCalled()
  })
})

/**
 * Correcting a mis-entry.
 *
 * It stays folded — this dialog is opened to record, and unfolded corrections push
 * half of it below the fold — but it reads as a button and carries the count of what
 * it can take back. A mis-entered basket is the second reason anyone opens this
 * dialog, not a footnote behind a small grey caption.
 */
describe('PlayerActionDialog — the corrections', () => {
  it('says how many actions it can take back', () => {
    renderDialog({ scoreCounts: { '2int': 2, '2ext': 0, '3': 1, lf: 0 }, fouls: 1, misses: 1 })
    // 2 + 1 baskets, one foul, one miss.
    expect(screen.getByText('(5)')).toBeInTheDocument()
  })

  it('stays out of the way entirely when there is nothing to correct', () => {
    // An enabled control that can do nothing reads as a fault; so does a count of
    // zero next to the word "correct".
    renderDialog()
    expect(screen.queryByText(/corriger/i)).not.toBeInTheDocument()
  })

  it('names the foul type it will remove, and removes that one', () => {
    // A type you can enter and never read back is a type nobody trusts: these buttons
    // are the only place the recorded type is shown.
    const { onRemoveFoul } = renderDialog({
      fouls: 3, foulCounts: { defensive: 2, technical: 1 }, onRemoveFoul: vi.fn(),
    })
    fireEvent.click(screen.getByText(/corriger/i))

    expect(screen.getByRole('button', { name: /retirer une faute défensive/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retirer une faute technique/i }))
    expect(onRemoveFoul).toHaveBeenCalledWith('technical')
  })

  it('offers no removal for a type that was never recorded', () => {
    // The regex has to say "retirer": the three recording buttons carry the same type
    // names and are always on screen.
    renderDialog({ fouls: 1, foulCounts: { offensive: 1 } })
    fireEvent.click(screen.getByText(/corriger/i))
    expect(screen.getByRole('button', { name: /retirer une faute offensive/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer une faute technique/i })).not.toBeInTheDocument()
  })
})

describe('PlayerActionDialog — a basket with no position', () => {
  it('records the two and the three, and closes, without a spot on the court', () => {
    // The way out when nobody saw where the shot came from. A two has to land in one
    // of the sheet's two columns and it lands in `2int`, the same convention the
    // opposition's quick buttons follow.
    const { onScore, onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 2 points' }))
    expect(onScore).toHaveBeenCalledWith('2int')
    expect(onClose).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 3 points' }))
    expect(onScore).toHaveBeenLastCalledWith('3')
  })
})
