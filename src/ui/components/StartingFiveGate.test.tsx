import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StartingFiveGate } from './StartingFiveGate'

describe('StartingFiveGate', () => {
  it('n’affiche qu’un seul panneau et garde le bouton de démarrage désactivé tant que le cinq n’est pas complet', () => {
    render(
      <StartingFiveGate
        rosterA={[]} requiredA={5}
        selected={{ A: [], B: [] }} onToggle={vi.fn()} onStart={vi.fn()} canStart={false}
      />,
    )
    expect(screen.getByText('MON ÉQUIPE')).toBeInTheDocument()
    expect(screen.queryByText('VISITEURS')).not.toBeInTheDocument()
    expect(screen.queryByText('LOCAUX')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Démarrer le match/ })).toBeDisabled()
  })
})
