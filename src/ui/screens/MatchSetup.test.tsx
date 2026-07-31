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
})
