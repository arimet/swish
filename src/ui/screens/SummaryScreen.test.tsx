import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SummaryScreen } from './SummaryScreen'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'match-finished'

beforeEach(async () => {
  sessionStorage.clear() // the summary reads without a role: each test starts as a visitor
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { clubId: 'ta', opponentId: 'tb' },
    roster: ['p1'],
    status: 'finished',
    events: [
      { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { id: 'e1', wallClock: 1, period: 1, gameClock: 590, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
      // An opposition basket entered as a total: no playerId, they have no roster.
      { id: 'e2', wallClock: 2, period: 1, gameClock: 580, type: 'SCORE', team: 'B', kind: '3' },
      { id: 'e3', wallClock: 3, period: 1, gameClock: 570, type: 'SCORE', team: 'B', kind: '3' },
    ],
  }
  await saveMatch(m)
})

describe('SummaryScreen', () => {
  it('shows the opposition\'s real score and the entered-as-a-total note, not a total of 0', async () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <SummaryScreen matchId={MATCH_ID} onHome={vi.fn()} />
        </MemoryRouter>
      </AuthProvider>,
    )

    // The opposition panel replaces the table (the printable sheet, hidden but present
    // in the DOM, carries the same message: we therefore target the on-screen panel
    // precisely, by its heading).
    const heading = await screen.findByText('Visiteurs · VERDUN')
    const card = heading.closest('section')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(/Score saisi globalement/)).toBeInTheDocument()
    // The real score (6 pts = 2 × 3pts), not a total of 0.
    expect(within(card as HTMLElement).getByText('6')).toBeInTheDocument()

    // A single "Total équipe" row (the home side's): no empty visitors' table.
    expect(screen.getAllByText('Total équipe')).toHaveLength(1)
  })
})

describe('SummaryScreen — the shooting percentage column', () => {
  it("shows a dash and not 100% when no missed shot was recorded in the game", async () => {
    const matchId = 'no-miss-tracked'
    await saveTeam({ id: 'tc', name: 'ÉPINAL' })
    await savePlayer({ id: 'p9', teamId: 'tc', number: 9, lastName: 'DUPONT', firstName: 'Marc' })
    const m: Match = {
      id: matchId,
      meta: { clubId: 'tc', opponentId: 'tb' },
      roster: ['p9'],
      status: 'finished',
      events: [
        { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p9'] },
        { id: 'e1', wallClock: 1, period: 1, gameClock: 590, type: 'SCORE', team: 'A', playerId: 'p9', kind: '2int' },
      ],
    }
    await saveMatch(m)

    render(
      <AuthProvider>
        <MemoryRouter>
          <SummaryScreen matchId={matchId} onHome={vi.fn()} />
        </MemoryRouter>
      </AuthProvider>,
    )

    await screen.findByText('DUPONT Marc')
    // The player made their only shot (fieldGoalsMade=1, misses=0): with no MISS
    // tracked in this game, there is no telling 100% from "not tracked".
    expect(screen.queryByText('100 %')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('SummaryScreen — rights', () => {
  const renderSummary = () =>
    render(<AuthProvider><MemoryRouter><SummaryScreen matchId={MATCH_ID} onHome={vi.fn()} /></MemoryRouter></AuthProvider>)

  it('post-game correction is refused to the scorer\'s table: no button, no correction mode', async () => {
    // Correcting a closed sheet is not the Saturday volunteer's job: neither correction
    // button is offered to them, and the mode does not open.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderSummary()
    await screen.findByText('Visiteurs · VERDUN')

    expect(screen.queryByRole('button', { name: /corriger stats/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /infos/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mode correction/)).not.toBeInTheDocument()
  })

  it('a visitor reads the summary without being asked for any code, and exports it', async () => {
    renderSummary()
    await screen.findByText('Visiteurs · VERDUN')
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
    // Reading, following and exporting write nothing: those three stay open to all.
    expect(screen.getByRole('button', { name: /exporter en pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /suivi/i })).toBeInTheDocument()
  })
})
