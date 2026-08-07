import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SpectatorMatch } from './SpectatorMatch'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

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
