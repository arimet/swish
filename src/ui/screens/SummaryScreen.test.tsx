import 'fake-indexeddb/auto'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SummaryScreen } from './SummaryScreen'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'solo-finished'

beforeEach(async () => {
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { teamAId: 'ta', teamBId: 'tb', solo: true },
    roster: { A: ['p1'], B: [] },
    status: 'finished',
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

describe('SummaryScreen — mode solo', () => {
  it('affiche le score adverse réel et la mention de saisie globale, pas un total à 0', async () => {
    render(
      <AdminProvider>
        <MemoryRouter>
          <SummaryScreen matchId={MATCH_ID} onHome={vi.fn()} />
        </MemoryRouter>
      </AdminProvider>,
    )

    // L'encart adverse remplace le tableau (la feuille imprimable, cachée mais présente dans le
    // DOM, porte le même message : on cible donc précisément l'encart écran par son en-tête).
    const heading = await screen.findByText('Visiteurs · VERDUN')
    const card = heading.closest('section')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(/Score saisi globalement/)).toBeInTheDocument()
    // Score réel (6 pts = 2 x 3pts), pas un total à 0.
    expect(within(card as HTMLElement).getByText('6')).toBeInTheDocument()

    // Une seule ligne « Total équipe » (celle des locaux) : pas de tableau visiteurs vide.
    expect(screen.getAllByText('Total équipe')).toHaveLength(1)
  })
})
