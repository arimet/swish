import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrintableSummary } from './PrintableSummary'
import type { Match } from '../domain/types'

const match: Match = {
  id: 'm', meta: {
    championshipLabel: 'Pré régionale masculine', matchNumber: '78',
    date: '22/05/26', venue: 'VIGNOT', referee1: 'BART S', teamAId: 'a', teamBId: 'b',
  },
  roster: { A: [], B: [] }, events: [], status: 'finished',
}

describe('PrintableSummary', () => {
  it('affiche l’en-tête de la rencontre', () => {
    render(<PrintableSummary match={match} players={{}} teamNames={{ A: 'VIGNOT', B: 'VERDUN' }} />)
    expect(screen.getByText(/Pré régionale masculine/)).toBeInTheDocument()
    expect(screen.getByText(/78/)).toBeInTheDocument()
    expect(screen.getByText(/BART S/)).toBeInTheDocument()
  })
})
