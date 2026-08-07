import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveMatch } from './LiveMatch'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'
import { getMatch, saveMatch, savePlayer } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'm1'

/** Monte l'écran live sur le match de test (cinq de départ posé, chrono démarré). */
function renderLive(matchId = MATCH_ID) {
  render(<MemoryRouter><AdminProvider><LiveMatch matchId={matchId} onFinish={() => {}} /></AdminProvider></MemoryRouter>)
}

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1') // démarrage protégé débloqué pour le test
  await db.matches.clear(); await db.players.clear()
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'HOSTIN', firstName: 'Steven' })
  const m: Match = {
    id: MATCH_ID, meta: { championshipLabel: 'PRM', teamAId: 'ta', teamBId: 'tb' },
    roster: { A: ['p1'], B: [] },
    events: [
      { id: 'e0', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 },
      { id: 'esf-a', type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'], wallClock: 1, period: 1, gameClock: 600 },
      { id: 'esf-b', type: 'STARTING_FIVE', team: 'B', playerIds: [], wallClock: 1, period: 1, gameClock: 600 },
      { id: 'e1', type: 'CLOCK_START', wallClock: 2, period: 1, gameClock: 600 },
    ],
    status: 'live',
  }
  await saveMatch(m)
})

describe('LiveMatch', () => {
  it('marque un panier à 2 pts intérieur pour un joueur, via la raquette du terrain', async () => {
    renderLive()
    await waitFor(() => screen.getByText(/HOSTIN/))
    await userEvent.click(screen.getByRole('button', { name: /HOSTIN/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Raquette' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      expect(saved!.events.some((e) => e.type === 'SCORE')).toBe(true)
    })
    const saved = await getMatch(MATCH_ID)
    const scored = saved!.events.find((e) => e.type === 'SCORE')
    expect(scored).toMatchObject({ kind: '2int' })
  })

  it('enregistre un 3 points avec sa position depuis le terrain', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: /HOSTIN/ }))
    // Aile / axe à 3 points : y ≈ 0,65 → 3 points.
    await userEvent.click(screen.getByRole('button', { name: 'Aile / axe à 3 pts' }))
    const saved = await getMatch(MATCH_ID)
    const scored = saved!.events.filter((e) => e.type === 'SCORE')
    expect(scored).toHaveLength(1)
    expect(scored[0]).toMatchObject({ kind: '3', shot: { x: 0.5, y: 0.68 } })
  })

  it('enregistre un tir manqué sans changer le score', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: /HOSTIN/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Manqué' }))
    await userEvent.click(screen.getByRole('button', { name: 'Raquette' }))
    const saved = await getMatch(MATCH_ID)
    expect(saved!.events.filter((e) => e.type === 'MISS')).toHaveLength(1)
    expect(saved!.events.filter((e) => e.type === 'SCORE')).toHaveLength(0)
  })

  it('affiche la porte du cinq de départ quand il manque un STARTING_FIVE, et démarre le match', async () => {
    await savePlayer({ id: 'p2', teamId: 'ta', number: 9, lastName: 'ALPHA', firstName: 'A' })
    await savePlayer({ id: 'p3', teamId: 'tb', number: 4, lastName: 'GAMMA', firstName: 'G' })
    const m: Match = {
      id: 'm2', meta: { championshipLabel: 'PRM', teamAId: 'ta', teamBId: 'tb' },
      roster: { A: ['p1', 'p2'], B: ['p3'] },
      events: [],
      status: 'live',
    }
    await saveMatch(m)

    renderLive('m2')
    await waitFor(() => screen.getByText(/Cinq de départ/i))
    await waitFor(() => screen.getByRole('button', { name: /HOSTIN/ }))

    // Sélection des 2 titulaires de l'équipe A (roster de taille 2 < 5)
    await userEvent.click(screen.getByRole('button', { name: /HOSTIN/ }))
    await userEvent.click(screen.getByRole('button', { name: /ALPHA/ }))
    // Sélection de l'unique joueur de l'équipe B
    await userEvent.click(screen.getByRole('button', { name: /GAMMA/ }))

    const startButton = screen.getByRole('button', { name: /démarrer le match/i })
    await waitFor(() => expect(startButton).not.toBeDisabled())
    await userEvent.click(startButton)

    await waitFor(async () => {
      const saved = await db.matches.get('m2')
      const sf = saved!.events.filter((e) => e.type === 'STARTING_FIVE')
      expect(sf).toHaveLength(2)
    })
    const saved = await db.matches.get('m2')
    const sfA = saved!.events.find((e) => e.type === 'STARTING_FIVE' && e.team === 'A')
    const sfB = saved!.events.find((e) => e.type === 'STARTING_FIVE' && e.team === 'B')
    expect(sfA).toMatchObject({ team: 'A', playerIds: expect.arrayContaining(['p1', 'p2']) })
    expect(sfB).toMatchObject({ team: 'B', playerIds: ['p3'] })

    // Une fois le cinq de départ posé, l'écran live normal s'affiche.
    await waitFor(() => expect(screen.queryByText(/Cinq de départ/i)).not.toBeInTheDocument())
  })

  it('dispatche une SUBSTITUTION depuis le dialogue de changement', async () => {
    await savePlayer({ id: 'p2', teamId: 'ta', number: 10, lastName: 'BENCH', firstName: 'B' })
    const m: Match = {
      id: 'm3', meta: { championshipLabel: 'PRM', teamAId: 'ta', teamBId: 'tb' },
      roster: { A: ['p1', 'p2'], B: [] },
      events: [
        { id: 'e0', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 },
        { id: 'esf-a', type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'], wallClock: 1, period: 1, gameClock: 600 },
        { id: 'esf-b', type: 'STARTING_FIVE', team: 'B', playerIds: [], wallClock: 1, period: 1, gameClock: 600 },
        { id: 'e1', type: 'CLOCK_START', wallClock: 2, period: 1, gameClock: 600 },
      ],
      status: 'live',
    }
    await saveMatch(m)

    renderLive('m3')
    await waitFor(() => screen.getByText(/HOSTIN/))

    await userEvent.click(screen.getByRole('button', { name: /changement locaux/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /HOSTIN/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /BENCH/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /valider/i }))

    await waitFor(async () => {
      const saved = await db.matches.get('m3')
      expect(saved!.events.some((e) => e.type === 'SUBSTITUTION')).toBe(true)
    })
    const saved = await db.matches.get('m3')
    const sub = saved!.events.find((e) => e.type === 'SUBSTITUTION')
    expect(sub).toMatchObject({ team: 'A', playerOutId: 'p1', playerInId: 'p2' })
  })
})
