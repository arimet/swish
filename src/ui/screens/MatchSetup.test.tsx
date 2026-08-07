import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchSetup } from './MatchSetup'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'
import { saveTeam, savePlayer } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1') // actions protégées débloquées pour le test
  await db.teams.clear(); await db.players.clear(); await db.matches.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'A', firstName: 'x' })
  await savePlayer({ id: 'p2', teamId: 'tb', number: 5, lastName: 'B', firstName: 'y' })
})

describe('MatchSetup', () => {
  it('crée un match et notifie onCreated', async () => {
    const onCreated = vi.fn()
    render(<MemoryRouter><AdminProvider><MatchSetup onCreated={onCreated} /></AdminProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('VIGNOT').length).toBeGreaterThan(0))
    await userEvent.type(screen.getByLabelText(/championnat/i), 'PRM')
    await userEvent.click(screen.getByRole('button', { name: /planifier la rencontre/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(await db.matches.count()).toBe(1)
    const [created] = await db.matches.toArray()
    expect(created.status).toBe('setup') // planifié, pas démarré
  })

  it('crée un match solo sans effectif adverse', async () => {
    const onCreated = vi.fn()
    render(<AdminProvider><MemoryRouter><MatchSetup onCreated={onCreated} /></MemoryRouter></AdminProvider>)
    await waitFor(() => expect(screen.getAllByText('VIGNOT').length).toBeGreaterThan(0))
    // Le nom accessible de la case concatène le titre et le paragraphe descriptif :
    // on ne peut pas matcher le libellé exact, une correspondance partielle sur le rôle suffit.
    await userEvent.click(await screen.findByRole('checkbox', { name: /Je ne détaille que mon équipe/ }))
    await userEvent.click(screen.getByRole('button', { name: /Planifier la rencontre/ }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const created = await db.matches.get(onCreated.mock.calls[0][0])
    expect(created!.meta.solo).toBe(true)
    expect(created!.roster.A).toHaveLength(1)
    expect(created!.roster.B).toEqual([])
  })
})
