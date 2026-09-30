import { fireEvent, render, screen } from '../../test/render'
import { describe, expect, it, vi } from 'vitest'
import { TeamPanel } from './TeamPanel'

describe('TeamPanel — the substitution button', () => {
  it('says what it does, in words', () => {
    const onSub = vi.fn()
    render(<TeamPanel title="VIGNOT" color="#000" players={[]} statsByPlayer={new Map()} teamFouls={0} bonus={false}
      timeoutsRemaining={2} onPick={vi.fn()} onScore={vi.fn()} onFoul={vi.fn()} onSub={onSub} onTimeout={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Changement VIGNOT' })
    expect(button).toHaveTextContent('Changement')
    fireEvent.click(button)
    expect(onSub).toHaveBeenCalled()
  })
})
