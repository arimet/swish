import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { ROLE_KEY } from './app/auth'
import { db } from './persistence/db'
import { saveTeam } from './persistence/repositories'

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
    await db.teams.clear()
    // No role unlocked, and that is the whole point of the test.
    //
    // It used to grant itself `admin` up front, "to test the journey rather than the
    // password box" — and that box was precisely the wall of first launch: a volunteer
    // on a blank install was asked for an administrator code nobody had given them. The
    // test's workaround described the defect without reporting it. Founding the club
    // now asks for nothing (cf. `TeamCreate.test.tsx`), so the journey is played as a
    // visitor.
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
