import { render, screen } from '../../test/render'
import { describe, expect, it, vi } from 'vitest'
import { StartingFiveGate } from './StartingFiveGate'

describe('StartingFiveGate', () => {
  it('shows a single panel and keeps the start button disabled until the five is complete', () => {
    render(
      <StartingFiveGate
        rosterA={[]} requiredA={5}
        selected={[]} onToggle={vi.fn()} onStart={vi.fn()} canStart={false}
      />,
    )
    expect(screen.getByText('MON ÉQUIPE')).toBeInTheDocument()
    expect(screen.queryByText('VISITEURS')).not.toBeInTheDocument()
    expect(screen.queryByText('LOCAUX')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Démarrer le match/ })).toBeDisabled()
  })
})
