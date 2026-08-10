import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveMatch } from './LiveMatch'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'
import { getMatch, saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'match-1'

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1')
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { clubId: 'ta', opponentId: 'tb' },
    roster: ['p1'],
    status: 'live',
    events: [
      { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { id: 'e1', wallClock: 1, period: 1, gameClock: 600, type: 'CLOCK_START' },
    ],
  }
  await saveMatch(m)
})

const renderLive = () =>
  render(<AdminProvider><MemoryRouter><LiveMatch matchId={MATCH_ID} onFinish={vi.fn()} /></MemoryRouter></AdminProvider>)

describe('LiveMatch', () => {
  it('n’affiche qu’une colonne d’équipe', async () => {
    renderLive()
    expect(await screen.findByText('MARTIN')).toBeInTheDocument()
    expect(screen.queryByText('VISITEURS')).not.toBeInTheDocument()
  })

  it('ajoute un panier adverse sans joueur identifié', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 3 points à VERDUN' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      const opp = saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')
      expect(opp).toHaveLength(1)
      expect(opp[0]).toMatchObject({ kind: '3' })
      expect((opp[0] as { playerId?: string }).playerId).toBeUndefined()
    })
  })

  it('retire le dernier panier adverse', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le dernier panier de VERDUN' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      expect(saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')).toHaveLength(0)
    })
  })
})
