import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Dashboard } from './Dashboard'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const TOP3 = { x: 0.5, y: 0.65 }

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

const finished = (id: string, pa: number, pb: number, events: Partial<GameEvent>[] = []): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
  roster: ['p1'], status: 'finished',
  events: [
    { type: 'CLOCK_START' as const },
    ...Array.from({ length: pa }, () => ({ type: 'SCORE' as const, team: 'A' as const, playerId: 'p1', kind: '2int' as const })),
    ...Array.from({ length: pb }, () => ({ type: 'SCORE' as const, team: 'B' as const, kind: '2int' as const })),
    ...events,
  ].map(ev),
})

const renderDash = () =>
  render(<MemoryRouter><ClubProvider><Dashboard /></ClubProvider></MemoryRouter>)

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Dashboard', () => {
  it('affiche le bilan du club', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText('VIGNOT')).toBeInTheDocument()
    expect(await screen.findByText('1V – 0D')).toBeInTheDocument()
  })

  it('met le match en direct en tête', async () => {
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
  })

  it('annonce la prochaine rencontre quand aucun match n’est en cours', async () => {
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup' })
    renderDash()
    expect(await screen.findByText(/prochaine rencontre/i)).toBeInTheDocument()
  })

  it('n’affiche pas de hot zone vide sans explication', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/aucun tir localisé/i)).toBeInTheDocument()
  })

  it('affiche la hot zone du club dès qu’un tir est localisé', async () => {
    await saveMatch(finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]))
    renderDash()
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })
})
