import { render, screen, waitFor } from './test/render'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ROLE_KEY } from './app/auth'
import { saveTeam } from './persistence/repositories'
import { clear } from './test/fakeApi'

beforeEach(async () => {
  // A club must be set to reach the shell: without it, App shows the welcome screen
  // instead of the dashboard this test expects.
  await saveTeam({ id: 'app-test-club', name: 'CLUB TEST' })
  localStorage.setItem('swish-club-id', 'app-test-club')
  sessionStorage.clear()
})

describe('App', () => {
  it('shows the home page (dashboard)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(/Tableau de bord/i).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/Swish/i).length).toBeGreaterThan(0)
  })

  it('no longer offers to change club: the application is one team\'s', async () => {
    // The club is set once, at first launch. Re-picking it only makes sense if it
    // disappears — that is the next test.
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(/Tableau de bord/i).length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: /changer de club/i })).not.toBeInTheDocument()
  })

  it('deleting your own team returns to the welcome screen, not to a ghost club', async () => {
    // ClubProvider only revalidates its team list on a club change: without the
    // clear() in TeamDetail, the dashboard would stay pinned to that deleted club with
    // an empty roster.
    sessionStorage.setItem(ROLE_KEY, 'admin')
    render(<App />)
    // "My team" appears twice in the DOM (sidebar and mobile bottom nav): jsdom does
    // not hide the second through `lg:hidden`, having no media queries. Both lead to
    // the same route, either will do.
    const teamLinks = await screen.findAllByRole('link', { name: /mon équipe/i })
    await userEvent.click(teamLinks[0])
    await screen.findByRole('heading', { name: /club test/i })

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    const confirmButtons = await screen.findAllByRole('button', { name: 'Supprimer' })
    await userEvent.click(confirmButtons[confirmButtons.length - 1])

    expect(await screen.findByText(/bienvenue sur swish/i)).toBeInTheDocument()
  })
})

describe('first launch (blank device)', () => {
  beforeEach(async () => {
    // Nobody ever replays this journey once demo data is in place: no club set, and no
    // team in the store to offer one.
    localStorage.clear()
    clear('team')
    // No role unlocked, and that is the whole point of the test: on a blank install
    // the first volunteer has no administrator code, and nobody has given them one.
    // Founding the club therefore asks for nothing (cf. `TeamCreate.test.tsx`), and
    // this journey is played as a visitor. A test that granted itself `admin` here
    // would pass while the real first launch hit a password box.
    sessionStorage.removeItem(ROLE_KEY)
  })

  it('leads from the welcome screen to the dashboard, by way of team creation', async () => {
    render(<App />)
    const link = await screen.findByRole('link', { name: /créer ma première équipe/i })
    await userEvent.click(link)
    // The creation route must stay reachable with no club set, otherwise the user
    // circles between the welcome screen and itself.
    expect(await screen.findByRole('heading', { name: /nouvelle équipe/i })).toBeInTheDocument()
    expect(screen.queryByText(/bienvenue sur swish/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'NOUVEAU CLUB')
    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    // The team just created must become the followed club and lead into the
    // application — no bounce back to the welcome screen for want of ClubProvider
    // revalidating its team list.
    expect(await screen.findByRole('heading', { name: /nouveau club/i })).toBeInTheDocument()
    expect(screen.queryByText(/bienvenue sur swish/i)).not.toBeInTheDocument()
    // And they arrive as an administrator, hence in front of an application where
    // something can be done: without that right, the shell's five screens offer no
    // create button and the journey stops there, silently.
    expect(sessionStorage.getItem(ROLE_KEY)).toBe('admin')
  })
})

/**
 * The gate in front of the whole application, when the database does not answer.
 *
 * There is no local store behind these screens any more: a failed read is not a
 * slower start, it is a start with no data. Two failures were possible and both were
 * silent — the gate never resolved, so "Loading…" stayed on screen for ever; and a
 * device with no club fell through to the welcome screen, which invites founding a
 * team the server already holds.
 */
describe('an unreachable database', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('says so instead of inviting a club to be founded again', async () => {
    localStorage.clear() // no club on this device: nothing to fall back on
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/hors ligne/i)
    expect(screen.queryByRole('link', { name: /créer ma première équipe/i })).not.toBeInTheDocument()
  })

  it('lets a device that already follows a club into the application', async () => {
    // The shell shows what it can and its pill carries the rest. Locking the volunteer
    // out of a match sheet because a list did not load would be the worse failure.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    render(<App />)

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    /* Found by its accessible name and not by `role="status"` alone: the waiting screen
       carries that role too (it is a live region), so a bare `findByRole('status')`
       resolves with whichever of the two is on screen at the first poll — and passed
       only as long as the gate happened to resolve within one microtask. */
    /* Found by its accessible name and not by `role="status"` alone: the waiting screen
       carries that role too (it is a live region), so a bare `findByRole('status')`
       resolves with whichever of the two is on screen at the first poll. */
    expect(await screen.findByRole('status', { name: /serveur ne répond pas/i }))
      .toHaveAttribute('title', expect.stringMatching(/serveur ne répond pas/i))
  })
})
