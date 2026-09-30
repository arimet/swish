import { render, screen, fireEvent, within } from '../../test/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerActionDialog } from './PlayerActionDialog'

const noop = vi.fn()

function renderDialog(over: Partial<Parameters<typeof PlayerActionDialog>[0]> = {}) {
  const props = {
    open: true, playerName: '4 ROUX',
    onClose: vi.fn(), onScore: vi.fn(), onMiss: vi.fn(), onFreeThrows: vi.fn(), onAndOne: vi.fn(), onAssist: vi.fn(), onFoul: noop, onStat: noop,
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
  const validate = () => screen.getByRole('button', { name: 'Valider le tir' })

  it('a tap only places the shot: closing records nothing', () => {
    const { onScore, onMiss, onClose } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
    expect(onScore).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onScore).not.toHaveBeenCalled()
    expect(onMiss).not.toHaveBeenCalled()
  })

  it('a second tap moves the shot, and validating records it once, at the last spot', () => {
    const { onScore, onClose } = renderDialog()
    expect(validate()).toBeDisabled()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    fireEvent.click(court(), { clientX: 150, clientY: 250 })
    expect(screen.getByRole('status')).toHaveTextContent('3 PTS')
    fireEvent.click(validate())
    expect(onScore).toHaveBeenCalledTimes(1)
    expect(onScore).toHaveBeenCalledWith('3', expect.objectContaining({ y: expect.any(Number) }))
    expect(vi.mocked(onScore).mock.calls[0][1]!.y).toBeGreaterThan(0.8)
    // The basket is in; the dialog stays for what follows it.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Panier enregistré · 3 PTS')
  })

  it('records a missed shot without counting points', () => {
    const { onScore, onMiss } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Manqué' }))
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(screen.getByRole('status')).toHaveTextContent('MANQUÉ · Raquette')
    fireEvent.click(validate())
    expect(onScore).not.toHaveBeenCalled()
    expect(onMiss).toHaveBeenCalledTimes(1)
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
          onClose={vi.fn()} onScore={vi.fn()} onMiss={vi.fn()} onFreeThrows={vi.fn()} onAndOne={vi.fn()} onAssist={vi.fn()} onFoul={onFoul} onStat={noop}
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
  it('records the two and the three without a spot on the court', () => {
    // The way out when nobody saw where the shot came from. A two has to land in one
    // of the sheet's two columns and it lands in `2int`, the same convention the
    // opposition's quick buttons follow.
    const { onScore } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 2 points' }))
    expect(onScore).toHaveBeenCalledWith('2int', undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 3 points' }))
    expect(onScore).toHaveBeenLastCalledWith('3', undefined)
  })
})

describe('PlayerActionDialog — the free-throw line', () => {
  it('enters two attempts, one made and one missed, in one validation', () => {
    const { onFreeThrows, onScore, onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer franc' }))
    // Two attempts by default, both made.
    fireEvent.click(within(screen.getByRole('group', { name: 'LF 2' })).getByRole('button', { name: 'Manqué' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider les lancers francs' }))
    expect(onFreeThrows).toHaveBeenCalledWith([true, false])
    expect(onScore).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('takes one to three attempts', () => {
    const { onFreeThrows } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer franc' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Tentatives' })).getByRole('button', { name: '3' }))
    expect(screen.getAllByRole('group', { name: /^LF \d$/ })).toHaveLength(3)
    fireEvent.click(within(screen.getByRole('group', { name: 'Tentatives' })).getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider les lancers francs' }))
    expect(onFreeThrows).toHaveBeenCalledWith([true])
  })

  it('goes back to the court without recording anything', () => {
    const { onFreeThrows } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer franc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(court()).toBeInTheDocument()
    expect(onFreeThrows).not.toHaveBeenCalled()
  })
})

describe('PlayerActionDialog — the and-one', () => {
  it('is offered after a basket, and records its one free throw', () => {
    const { onAndOne, onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 2 points' }))
    fireEvent.click(screen.getByRole('button', { name: 'And one' }))
    // One attempt, and no choosing how many.
    expect(screen.queryByRole('group', { name: 'Tentatives' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^LF \d$/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Valider les lancers francs' }))
    expect(onAndOne).toHaveBeenCalledWith(true)
    // Back on the basket, for its pass — and the and-one is not offered twice.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'And one' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('is not offered after a miss', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Manqué' }))
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    fireEvent.click(screen.getByRole('button', { name: 'Valider le tir' }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'And one' })).not.toBeInTheDocument()
  })
})

describe('PlayerActionDialog — the assist, asked after the basket', () => {
  const teammates = [{ id: 'p2', name: '7 DURAND' }, { id: 'p3', name: '9 PETIT' }]

  it('credits the passer in one more tap', () => {
    const { onScore, onAssist, onClose } = renderDialog({ teammates })
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    fireEvent.click(screen.getByRole('button', { name: 'Valider le tir' }))
    fireEvent.click(screen.getByRole('button', { name: '7 DURAND' }))
    expect(onScore).toHaveBeenCalledTimes(1)
    expect(onAssist).toHaveBeenCalledWith('p2')
    expect(onClose).toHaveBeenCalled()
  })

  it('"none" closes and records nothing more', () => {
    const { onAssist, onClose } = renderDialog({ teammates })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 3 points' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aucune passe décisive' }))
    expect(onAssist).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('is no longer a button of its own in the grid', () => {
    renderDialog({ teammates })
    expect(screen.queryByRole('button', { name: /passe déc/i })).not.toBeInTheDocument()
  })

  it('is not asked after a free throw', () => {
    const { onClose } = renderDialog({ teammates })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer franc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider les lancers francs' }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText('Passe décisive de…')).not.toBeInTheDocument()
  })
})
