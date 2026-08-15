import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveMatch } from './LiveMatch'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { getMatch, saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'match-1'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
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
  render(<AuthProvider><MemoryRouter><LiveMatch matchId={MATCH_ID} onFinish={vi.fn()} /></MemoryRouter></AuthProvider>)

describe('LiveMatch', () => {
  it('shows a single team column', async () => {
    renderLive()
    expect(await screen.findByText('MARTIN')).toBeInTheDocument()
    expect(screen.queryByText('VISITEURS')).not.toBeInTheDocument()
  })

  it('adds an opposition basket with no player named', async () => {
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

  it('removes the last opposition basket', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le dernier panier de VERDUN' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      expect(saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')).toHaveLength(0)
    })
  })
})

// Câblage complet de l'écran, du côté de notre équipe : la table de marque n'avait
// plus aucun test de parcours depuis la suppression de l'ancien écran à deux
// équipes. Une inversion de `onScore`/`onMiss`, ou une rupture de la porte du cinq
// de départ, doit faire échouer ces tests — vérifié par mutation (voir le rapport).
describe('the full run', () => {
  const ID = 'e2e'

  beforeEach(async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
    for (let i = 0; i < 6; i++)
      await savePlayer({ id: `p${i}`, teamId: 'ta', number: 4 + i, lastName: `NOM${i}`, firstName: 'X' })
    const m: Match = {
      id: ID, meta: { clubId: 'ta', opponentId: 'tb' },
      roster: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      events: [], status: 'live',
    }
    await saveMatch(m)
  })

  const renderE2E = (onFinish = vi.fn()) =>
    render(<AuthProvider><MemoryRouter><LiveMatch matchId={ID} onFinish={onFinish} /></MemoryRouter></AuthProvider>)

  it('starting five → located basket → missed shot → substitution → finish', async () => {
    const onFinish = vi.fn()
    renderE2E(onFinish)

    // 1. Porte du cinq de départ : cinq titulaires puis démarrage
    await waitFor(() => screen.getByText(/Cinq de départ/i))
    await screen.findByRole('button', { name: /NOM0/ })
    for (let i = 0; i < 5; i++)
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`NOM${i}`) }))
    const start = screen.getByRole('button', { name: /Démarrer le match/i })
    await waitFor(() => expect(start).not.toBeDisabled())
    await userEvent.click(start)
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'STARTING_FIVE')).toHaveLength(1)
    })

    // 2. L'écran live remplace la porte
    await waitFor(() => expect(screen.queryByText(/Cinq de départ/i)).not.toBeInTheDocument())

    // Le chrono doit tourner pour qu'un SCORE/MISS soit accepté par les règles
    await userEvent.click(screen.getByRole('button', { name: /Démarrer$/ }))

    // 3. Panier à 2 points intérieur d'un de nos joueurs, avec sa position de tir
    await userEvent.click(screen.getByRole('button', { name: /NOM0/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Raquette' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'SCORE' && e.team === 'A')).toHaveLength(1)
    })
    const afterScore = await getMatch(ID)
    expect(afterScore!.events.find((e) => e.type === 'SCORE')).toMatchObject({
      kind: '2int', playerId: 'p0', shot: { x: expect.any(Number), y: expect.any(Number) },
    })

    // 4. Panier à 3 points d'un autre joueur, position de tir enregistrée
    await userEvent.keyboard('{Escape}') // ferme le dialogue avant d'en ouvrir un autre
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /NOM1/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Aile / axe à 3 pts' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'SCORE' && e.playerId === 'p1')).toHaveLength(1)
    })
    const afterThree = await getMatch(ID)
    expect(afterThree!.events.find((e) => e.type === 'SCORE' && e.playerId === 'p1')).toMatchObject({
      kind: '3', shot: { x: expect.any(Number), y: expect.any(Number) },
    })

    // 5. Tir manqué d'un troisième joueur : aucun changement de score
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const scoreBefore = (await getMatch(ID))!.events.filter((e) => e.type === 'SCORE').length
    await userEvent.click(screen.getByRole('button', { name: /NOM2/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Manqué' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Raquette' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'MISS')).toHaveLength(1)
    })
    const afterMiss = await getMatch(ID)
    expect(afterMiss!.events.filter((e) => e.type === 'SCORE')).toHaveLength(scoreBefore)

    // 6. Changement depuis le dialogue de substitution
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Changement VIGNOT/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /NOM0/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /NOM5/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /valider/i }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.some((e) => e.type === 'SUBSTITUTION')).toBe(true)
    })

    // 7. Fin de match
    await userEvent.click(screen.getByRole('button', { name: /Terminer/ }))
    const confirm = await screen.findByRole('dialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /^Terminer$/ }))
    await waitFor(() => expect(onFinish).toHaveBeenCalled())
    expect((await getMatch(ID))!.status).toBe('finished')
  })
})

describe('LiveMatch — rights', () => {
  it('the scorer\'s table records the game without being asked for any code', async () => {
    // Le cœur du modèle : le bénévole tient la feuille sans détenir le code admin.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))

    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      expect(saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')).toHaveLength(1)
    })
  })

  it('a visitor records nothing: the screen announces the scorer\'s-table access instead of the sheet', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    renderLive()
    expect(await screen.findByRole('heading', { name: /Accès Table de marque requis/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter 2 points à VERDUN' })).not.toBeInTheDocument()
  })
})
