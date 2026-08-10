import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SpectatorMatch } from './SpectatorMatch'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const MATCH_ID = 'solo-spectator'

beforeEach(async () => {
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { teamAId: 'ta', teamBId: 'tb', solo: true },
    roster: { A: ['p1'], B: [] },
    status: 'live',
    events: [
      { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { id: 'e1', wallClock: 1, period: 1, gameClock: 590, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
      // Panier adverse saisi globalement : pas de playerId, comme en mode solo réel.
      { id: 'e2', wallClock: 2, period: 1, gameClock: 580, type: 'SCORE', team: 'B', kind: '3' },
      { id: 'e3', wallClock: 3, period: 1, gameClock: 570, type: 'SCORE', team: 'B', kind: '3' },
    ],
  }
  await saveMatch(m)
})

describe('SpectatorMatch — mode solo', () => {
  it("affiche le score adverse réel côté spectateur, pas un tableau vide à 0", async () => {
    render(
      <MemoryRouter>
        <SpectatorMatch matchId={MATCH_ID} />
      </MemoryRouter>,
    )

    // Encart adverse : score réel (6 pts) et mention de la saisie globale.
    expect(await screen.findByText('Score saisi globalement')).toBeInTheDocument()
    const scoreEls = await screen.findAllByText('6')
    expect(scoreEls.length).toBeGreaterThan(0)

    // Aucun bandeau fautes/TM pour le côté B (rien n'est saisissable en mode solo).
    expect(screen.queryAllByText(/TM/)).toHaveLength(1)
  })
})

const TOP3 = { x: 0.5, y: 0.65 }
const SPEC_MATCH_ID = 'spec-1'

const ev = (e: Partial<GameEvent>, i: number): GameEvent =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

describe('SpectatorMatch — carte de tirs par joueur', () => {
  beforeEach(async () => {
    await saveTeam({ id: 'ta2', name: 'VIGNOT' }); await saveTeam({ id: 'tb2', name: 'VERDUN' })
    await savePlayer({ id: 'p2', teamId: 'ta2', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
    const rawEvents: Partial<GameEvent>[] = [
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p2'] },
      { type: 'CLOCK_START' },
      { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3', shot: TOP3 },
    ]
    const m: Match = {
      id: SPEC_MATCH_ID, meta: { teamAId: 'ta2', teamBId: 'tb2' },
      roster: { A: ['p2'], B: [] }, status: 'live',
      events: rawEvents.map(ev),
    }
    await saveMatch(m)
  })

  it('déplie la carte du joueur au clic sur sa ligne', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={SPEC_MATCH_ID} /></MemoryRouter>)
    const row = await screen.findByRole('button', { name: /MARTIN/ })
    expect(screen.queryByLabelText('Carte des tirs')).not.toBeInTheDocument()
    await userEvent.click(row)
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })

  it('n’ouvre qu’une carte à la fois et referme au second clic', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={SPEC_MATCH_ID} /></MemoryRouter>)
    const row = await screen.findByRole('button', { name: /MARTIN/ })
    await userEvent.click(row)
    await userEvent.click(row)
    expect(screen.queryByLabelText('Carte des tirs')).not.toBeInTheDocument()
  })
})
