import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchSetup } from './MatchSetup'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveTeam, savePlayer } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin') // guarded actions unlocked for the test
  localStorage.setItem('swish-club-id', 'ta') // our club is already set (this screen sits behind the club gate)
  await db.teams.clear(); await db.players.clear(); await db.matches.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'A', firstName: 'x' })
  await savePlayer({ id: 'p2', teamId: 'tb', number: 5, lastName: 'B', firstName: 'y' })
})

describe('MatchSetup', () => {
  it('creates a game and notifies onCreated', async () => {
    const onCreated = vi.fn()
    render(<MemoryRouter><ClubProvider><AuthProvider><MatchSetup onCreated={onCreated} /></AuthProvider></ClubProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('VIGNOT').length).toBeGreaterThan(0))
    await userEvent.type(screen.getByLabelText(/championnat/i), 'PRM')
    await userEvent.click(screen.getByRole('button', { name: /planifier la rencontre/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(await db.matches.count()).toBe(1)
    const [created] = await db.matches.toArray()
    expect(created.status).toBe('setup') // planifié, pas démarré
  })

  it('our club is fixed in advance and the opposition has no detailed roster', async () => {
    const onCreated = vi.fn()
    render(<ClubProvider><MemoryRouter><AuthProvider><MatchSetup onCreated={onCreated} /></AuthProvider></MemoryRouter></ClubProvider>)
    await waitFor(() => expect(screen.getAllByText('VIGNOT').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: /Planifier la rencontre/ }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const created = await db.matches.get(onCreated.mock.calls[0][0])
    expect(created!.meta.clubId).toBe('ta')
    expect(created!.meta.opponentId).toBe('tb')
    expect(created!.roster).toEqual(['p1']) // our roster only, the opposition has none
  })
})

describe('MatchSetup — rights', () => {
  it('planning a game is administrative: the scorer\'s table does not see the form, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    const onCreated = vi.fn()
    render(
      <MemoryRouter initialEntries={['/match/new']}>
        <ClubProvider><AuthProvider>
          <Routes>
            <Route path="/match/new" element={<MatchSetup onCreated={onCreated} />} />
            <Route path="/calendrier" element={<p>Calendrier</p>} />
          </Routes>
        </AuthProvider></ClubProvider>
      </MemoryRouter>,
    )

    // This screen exists only to write: without the right, the direct URL redirects to
    // the calendar rather than opening a form with no submit.
    expect(await screen.findByText('Calendrier')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /planifier la rencontre/i })).not.toBeInTheDocument()
    // What matters: no game is created.
    expect(await db.matches.count()).toBe(0)
    expect(onCreated).not.toHaveBeenCalled()
  })
})
