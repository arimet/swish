import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayerDetail } from './PlayerDetail'
import { AuthProvider, PLAYER_ID_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const TOP3 = { x: 0.5, y: 0.65 }

const match = (id: string, events: Partial<GameEvent>[]): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
  roster: ['p1'], status: 'finished',
  events: events.map((e, i) => ({ id: `${id}-e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  await saveMatch(match('m1', [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: { x: 0.5, y: 0.15 } },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
  ]))
})

const renderAt = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/players/${id}`]}>
      <AuthProvider>
        <Routes><Route path="/players/:id" element={<PlayerDetail />} /></Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

describe('PlayerDetail', () => {
  it('shows the identity, the totals and the shooting percentages', async () => {
    renderAt('p1')
    expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
    expect(await screen.findByText('75 %')).toBeInTheDocument() // 3 tirs sur 4
    expect(screen.getByText('67 %')).toBeInTheDocument() // 2 tirs à 3 pts sur 3
    expect(screen.getByText('Points / match').closest('div')).toHaveTextContent('8') // 2×3 + 1×2
  })

  it('lists the player\'s games', async () => {
    renderAt('p1')
    await waitFor(() => expect(screen.getByText(/Poule A/)).toBeInTheDocument())
  })

  it('reports a player that cannot be found', async () => {
    renderAt('inconnu')
    expect(await screen.findByText(/introuvable/i)).toBeInTheDocument()
  })

  it('shows the age and the height when they are filled in', async () => {
    await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas', birthDate: '2000-06-15', height: 192 })
    renderAt('p1')
    expect(await screen.findByText(/192 cm/)).toBeInTheDocument()
    expect(screen.getByText(/ans/)).toBeInTheDocument()
  })

  it('shows no details block when nothing is filled in', async () => {
    renderAt('p1')
    expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
    expect(screen.queryByText(/cm/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ans/)).not.toBeInTheDocument()
  })

  it('shows the secondary statistics as a per-game average', async () => {
    renderAt('p1')
    await screen.findByText('MARTIN Lucas')
    // One assist in one game → 1.0 per game, never "1".
    const ligne = screen.getByText('Passes décisives').closest('div')!
    expect(within(ligne).getByText('1,0')).toBeInTheDocument()
  })

  it('shows a dash rather than a zero for a player with no game', async () => {
    await db.matches.clear()
    renderAt('p1')
    expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
    expect(screen.queryByText('0,0')).not.toBeInTheDocument()
  })

  it('quietly tells the identified player that this is their record', async () => {
    localStorage.setItem(PLAYER_ID_KEY, 'p1')
    renderAt('p1')
    expect(await screen.findByText(/c’est vous/i)).toBeInTheDocument()
  })

  it('says nothing on the record of a player other than the identified one', async () => {
    await savePlayer({ id: 'p2', teamId: 'ta', number: 9, lastName: 'DURAND', firstName: 'Théo' })
    localStorage.setItem(PLAYER_ID_KEY, 'p1')
    renderAt('p2')
    expect(await screen.findByText('DURAND Théo')).toBeInTheDocument()
    expect(screen.queryByText(/c’est vous/i)).not.toBeInTheDocument()
  })

  it('says nothing when the saved id matches nobody', async () => {
    // The identified player has been removed from the roster: their record no longer
    // exists, and nobody else's must inherit the mention.
    localStorage.setItem(PLAYER_ID_KEY, 'parti')
    renderAt('p1')
    expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
    expect(screen.queryByText(/c’est vous/i)).not.toBeInTheDocument()
  })
})
