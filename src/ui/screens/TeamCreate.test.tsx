import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamCreate } from './TeamCreate'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveTeam } from '../../persistence/repositories'

beforeEach(async () => { sessionStorage.setItem(ROLE_KEY, 'admin'); await db.teams.clear(); await db.players.clear() })

describe('TeamCreate', () => {
  it('creates a team (with a player) and saves it', async () => {
    render(<MemoryRouter><ClubProvider><AuthProvider><TeamCreate /></AuthProvider></ClubProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'VIGNOT')

    // Adds a player along the way. The fields are addressed by their label and not by
    // their `placeholder`: that is what a screen reader hears, and the `placeholder`
    // stopped carrying the field's name once it gained a label.
    await userEvent.type(screen.getByLabelText('N°'), '7')
    await userEvent.type(screen.getByLabelText('Nom'), 'HOSTIN')
    await userEvent.click(screen.getByRole('button', { name: /ajouter ce joueur/i }))

    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    await waitFor(async () => expect(await db.teams.count()).toBe(1))
    const teams = await db.teams.toArray()
    expect(teams[0].name).toBe('VIGNOT')
    expect(await db.players.count()).toBe(1)
  })
})

describe('TeamCreate — rights', () => {
  it('creating a team is administrative: the scorer\'s table is asked for the admin code', async () => {
    // A team already exists, and that is the premise this test was missing: the rule
    // "creating a team is administrative" protects data, so it only applies from the
    // moment there is some. On an empty store, creation is the founding of the club and
    // asks for nothing — see the test just below.
    await saveTeam({ id: 'deja', name: 'DÉJÀ LÀ' })
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    render(<MemoryRouter><ClubProvider><AuthProvider><TeamCreate /></AuthProvider></ClubProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'VIGNOT')
    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect(await db.teams.count()).toBe(1) // seule « DÉJÀ LÀ », rien de créé
  })

  /**
   * Founding the club, with no code and no prior right.
   *
   * This was the wall of first launch, and it was invisible: the "Create the team"
   * button went through `guard('manage', …)`, so that the very first volunteer on a
   * blank install got an administrator-code prompt nobody had given them — for the one
   * action that makes the application usable. The first-launch journey was indeed
   * tested in `App.test.tsx`, but by granting itself `admin` up front "to test the
   * journey rather than the password box": the workaround was written in black and
   * white, and the wall with it.
   */
  it('the first team is created without a code, and its author becomes an administrator', async () => {
    sessionStorage.removeItem(ROLE_KEY) // visitor, the default state
    render(<MemoryRouter><ClubProvider><AuthProvider><TeamCreate /></AuthProvider></ClubProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'PREMIER CLUB')
    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    await waitFor(async () => expect(await db.teams.count()).toBe(1))
    expect(screen.queryByRole('heading', { name: /Accès Administrateur requis/ })).not.toBeInTheDocument()
    // And the founder keeps the right afterwards, otherwise they land back on a
    // dashboard with not one create button.
    expect(sessionStorage.getItem(ROLE_KEY)).toBe('admin')
  })
})
