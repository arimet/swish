import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrintableSummary } from './PrintableSummary'
import type { Match } from '../domain/types'

const match: Match = {
  id: 'm', meta: {
    championshipLabel: 'Pré régionale masculine', matchNumber: '78',
    date: '22/05/26', venue: 'VIGNOT', referee1: 'BART S', clubId: 'a', opponentId: 'b',
  },
  roster: [], events: [], status: 'finished',
}

describe('PrintableSummary', () => {
  it('shows the game\'s header', () => {
    render(<PrintableSummary match={match} players={{}} teamNames={{ A: 'VIGNOT', B: 'VERDUN' }} />)
    expect(screen.getByText(/Pré régionale masculine/)).toBeInTheDocument()
    expect(screen.getByText(/78/)).toBeInTheDocument()
    expect(screen.getByText(/BART S/)).toBeInTheDocument()
  })

  it('shows the opposition\'s real score rather than a total of 0', () => {
    const soloMatch: Match = {
      ...match,
      events: [
        { id: 'e1', wallClock: 1, period: 1, gameClock: 590, type: 'SCORE', team: 'B', kind: '3' },
        { id: 'e2', wallClock: 2, period: 1, gameClock: 580, type: 'SCORE', team: 'B', kind: '3' },
      ],
    }
    render(<PrintableSummary match={soloMatch} players={{}} teamNames={{ A: 'VIGNOT', B: 'VERDUN' }} />)
    expect(screen.getByText(/Score saisi globalement/)).toBeInTheDocument()
    expect(screen.getByText(/VERDUN.*6 points/)).toBeInTheDocument()
    // A single "Total Équipe" row (the home side's): no visitors' table at 0.
    expect(screen.getAllByText('Total Équipe')).toHaveLength(1)
  })
})
