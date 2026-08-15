import 'fake-indexeddb/auto'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SummaryScreen } from './SummaryScreen'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'match-finished'

beforeEach(async () => {
  sessionStorage.clear() // le résumé se consulte sans rôle : chaque test repart visiteur
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
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
      // Panier adverse saisi globalement : pas de playerId, l'adversaire n'a pas d'effectif.
      { id: 'e2', wallClock: 2, period: 1, gameClock: 580, type: 'SCORE', team: 'B', kind: '3' },
      { id: 'e3', wallClock: 3, period: 1, gameClock: 570, type: 'SCORE', team: 'B', kind: '3' },
    ],
  }
  await saveMatch(m)
})

describe('SummaryScreen', () => {
  it('affiche le score adverse réel et la mention de saisie globale, pas un total à 0', async () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <SummaryScreen matchId={MATCH_ID} onHome={vi.fn()} />
        </MemoryRouter>
      </AuthProvider>,
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

describe('SummaryScreen — colonne %Tirs', () => {
  it("affiche — et non 100 % quand aucun tir manqué n'a été saisi sur la rencontre", async () => {
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
    // Le joueur a marqué son seul tir (fieldGoalsMade=1, misses=0) : sans MISS suivi
    // sur ce match, on ne peut pas savoir si c'est 100 % ou juste « pas suivi ».
    expect(screen.queryByText('100 %')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('SummaryScreen — droits', () => {
  const renderRésumé = () =>
    render(<AuthProvider><MemoryRouter><SummaryScreen matchId={MATCH_ID} onHome={vi.fn()} /></MemoryRouter></AuthProvider>)

  it('la correction après match est refusée à la table de marque : ni bouton, ni mode correction', async () => {
    // Corriger une feuille close n'est pas le travail du bénévole du samedi : les
    // deux boutons de correction ne lui sont pas proposés, et le mode ne s'ouvre pas.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderRésumé()
    await screen.findByText('Visiteurs · VERDUN')

    expect(screen.queryByRole('button', { name: /corriger stats/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /infos/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mode correction/)).not.toBeInTheDocument()
  })

  it('un visiteur consulte le résumé sans qu’aucun code lui soit demandé, et l’exporte', async () => {
    renderRésumé()
    await screen.findByText('Visiteurs · VERDUN')
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
    // Lire, suivre et exporter n'écrivent rien : ces trois-là restent à tous.
    expect(screen.getByRole('button', { name: /exporter en pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /suivi/i })).toBeInTheDocument()
  })
})
