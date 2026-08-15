import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SpectatorMatch } from './SpectatorMatch'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const MATCH_ID = 'match-spectator'

beforeEach(async () => {
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { clubId: 'ta', opponentId: 'tb' },
    roster: ['p1'],
    status: 'live',
    events: [
      { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { id: 'e1', wallClock: 1, period: 1, gameClock: 590, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
      // Panier adverse saisi globalement : pas de playerId, l'adversaire n'a pas d'effectif.
      { id: 'e2', wallClock: 2, period: 1, gameClock: 580, type: 'SCORE', team: 'B', kind: '3' },
      { id: 'e3', wallClock: 3, period: 1, gameClock: 570, type: 'SCORE', team: 'B', kind: '3' },
    ],
  }
  await saveMatch(m)
})

describe('SpectatorMatch', () => {
  it("shows the opposition's real score on the spectator side, not an empty table at 0", async () => {
    render(
      <MemoryRouter>
        <SpectatorMatch matchId={MATCH_ID} />
      </MemoryRouter>,
    )

    // Encart adverse : score réel (6 pts) et mention de la saisie globale.
    expect(await screen.findByText('Score saisi globalement')).toBeInTheDocument()
    const scoreEls = await screen.findAllByText('6')
    expect(scoreEls.length).toBeGreaterThan(0)

    // Aucun bandeau fautes/TM pour le côté B (l'adversaire n'a rien de saisissable).
    expect(screen.queryAllByText(/TM/)).toHaveLength(1)
  })
})

const TOP3 = { x: 0.5, y: 0.65 }
const SPEC_MATCH_ID = 'spec-1'

const ev = (e: Partial<GameEvent>, i: number): GameEvent =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

describe('SpectatorMatch — per-player shot chart', () => {
  beforeEach(async () => {
    await saveTeam({ id: 'ta2', name: 'VIGNOT' }); await saveTeam({ id: 'tb2', name: 'VERDUN' })
    await savePlayer({ id: 'p2', teamId: 'ta2', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
    await savePlayer({ id: 'p2b', teamId: 'ta2', number: 9, lastName: 'DUPONT', firstName: 'Julie' })
    const rawEvents: Partial<GameEvent>[] = [
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p2', 'p2b'] },
      { type: 'CLOCK_START' },
      { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p2b', kind: '3', shot: TOP3 },
    ]
    const m: Match = {
      id: SPEC_MATCH_ID, meta: { clubId: 'ta2', opponentId: 'tb2' },
      roster: ['p2', 'p2b'], status: 'live',
      events: rawEvents.map(ev),
    }
    await saveMatch(m)
  })

  it('unfolds the player\'s chart on a click on their row', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={SPEC_MATCH_ID} /></MemoryRouter>)
    const row = await screen.findByRole('button', { name: /MARTIN/ })
    expect(screen.queryByLabelText('Carte des tirs')).not.toBeInTheDocument()
    await userEvent.click(row)
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })

  it('opens one chart at a time and closes on a second click', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={SPEC_MATCH_ID} /></MemoryRouter>)
    const row = await screen.findByRole('button', { name: /MARTIN/ })
    await userEvent.click(row)
    await userEvent.click(row)
    expect(screen.queryByLabelText('Carte des tirs')).not.toBeInTheDocument()
  })

  it('opening a second player\'s chart closes the first (shared state, not per row)', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={SPEC_MATCH_ID} /></MemoryRouter>)
    const rowA = await screen.findByRole('button', { name: /MARTIN/ })
    const rowB = await screen.findByRole('button', { name: /DUPONT/ })

    await userEvent.click(rowA)
    expect(await screen.findAllByLabelText('Carte des tirs')).toHaveLength(1)

    await userEvent.click(rowB)
    // Une seule carte affichée à la fois, projection oblige : un état par ligne
    // laisserait les deux ouvertes ici.
    expect(await screen.findAllByLabelText('Carte des tirs')).toHaveLength(1)
  })
})
