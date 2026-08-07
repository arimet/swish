import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayerDetail } from './PlayerDetail'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const TOP3 = { x: 0.5, y: 0.65 }

const match = (id: string, events: Partial<GameEvent>[]): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', teamAId: 'ta', teamBId: 'tb' },
  roster: { A: ['p1'], B: [] }, status: 'finished',
  events: events.map((e, i) => ({ id: `${id}-e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

beforeEach(async () => {
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  await saveMatch(match('m1', [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
  ]))
})

const renderAt = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/players/${id}`]}>
      <Routes><Route path="/players/:id" element={<PlayerDetail />} /></Routes>
    </MemoryRouter>,
  )

describe('PlayerDetail', () => {
  it('affiche l’identité, les totaux et la réussite aux tirs', async () => {
    renderAt('p1')
    expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
    // Tous les tirs localisés sont à 3 pts ici : réussite aux tirs et à 3 pts coïncident (2/3).
    expect(await screen.findAllByText('67 %')).toHaveLength(2)
    expect(screen.getByText('6')).toBeInTheDocument() // points par match
  })

  it('liste les rencontres du joueur', async () => {
    renderAt('p1')
    await waitFor(() => expect(screen.getByText(/Poule A/)).toBeInTheDocument())
  })

  it('signale un joueur introuvable', async () => {
    renderAt('inconnu')
    expect(await screen.findByText(/introuvable/i)).toBeInTheDocument()
  })
})
