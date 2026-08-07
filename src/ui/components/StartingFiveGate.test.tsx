import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StartingFiveGate } from './StartingFiveGate'

describe('StartingFiveGate', () => {
  it('affiche les deux panneaux quand `solo` est absent, même avec un effectif adverse vide', () => {
    // Une équipe B sans joueur (créée sans effectif) ne doit pas être confondue avec le mode solo :
    // seul le drapeau explicite `solo` doit masquer le panneau visiteurs.
    render(
      <StartingFiveGate
        rosterA={[]} rosterB={[]} requiredA={5} requiredB={0}
        selected={{ A: [], B: [] }} onToggle={vi.fn()} onStart={vi.fn()} canStart={false}
      />,
    )
    expect(screen.getByText('LOCAUX')).toBeInTheDocument()
    expect(screen.getByText('VISITEURS')).toBeInTheDocument()
  })
})
