import { render, screen, fireEvent, act } from '@testing-library/react'
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
  // jsdom ne calcule pas de mise en page : on fixe la boîte du SVG à 300×280.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('PlayerActionDialog — saisie du tir', () => {
  it('enregistre un seul tir même si l’on touche le terrain deux fois', () => {
    const { onScore } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    fireEvent.click(court(), { clientX: 40, clientY: 200 })
    expect(onScore).toHaveBeenCalledTimes(1)
  })

  it('affiche les points et la zone avant de fermer', () => {
    const { onClose } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(SHOT_FEEDBACK_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('annonce un tir manqué sans compter de points', () => {
    const { onScore, onMiss } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Manqué' }))
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(onScore).not.toHaveBeenCalled()
    expect(onMiss).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('MANQUÉ · Raquette')
  })
})
