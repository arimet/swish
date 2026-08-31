import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { OliveShell } from './OliveShell'
import { AuthProvider, PLAYER_ID_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { savePlayer, saveTeam } from '../../persistence/repositories'

const renderShell = () =>
  render(
    <MemoryRouter>
      <ClubProvider>
        <AuthProvider>
          <Routes>
            <Route element={<OliveShell />}>
              <Route index element={<p>contenu</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

/** The access entry point exists in two copies (mobile header and sidebar): we always
 *  go through the sidebar's. */
const openAccess = async () => {
  const aside = await screen.findByRole('complementary')
  await userEvent.click(within(aside).getByRole('button', { name: /accès/i }))
}

/** The access dialog is modal: whatever is behind it stays unreachable to role
 *  queries until it is closed. */
const closeAccess = async () => {
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByLabelText(/code d.accès/i)).not.toBeInTheDocument())
}

const saisirLeCode = async (code: string) => {
  await userEvent.type(await screen.findByLabelText(/code d.accès/i), code)
  await userEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
}

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  await savePlayer({ id: 'p2', teamId: 'ta', number: 9, lastName: 'DURAND', firstName: 'Théo' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('the access entry point', () => {
  it('states the current role, takes another on entering a code, and locks', async () => {
    renderShell()
    await openAccess()
    expect(await screen.findByText(/accès en cours : visiteur/i)).toBeInTheDocument()

    await saisirLeCode('marque')
    expect(await screen.findByText(/accès en cours : table de marque/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /se verrouiller/i }))
    expect(await screen.findByText(/accès en cours : visiteur/i)).toBeInTheDocument()
  })

  it('refuses an unknown code without changing the current role', async () => {
    renderShell()
    await openAccess()
    await saisirLeCode('n-importe-quoi')
    expect(await screen.findByText(/code inconnu/i)).toBeInTheDocument()
    expect(screen.getByText(/accès en cours : visiteur/i)).toBeInTheDocument()
  })

  it('the player code opens the name picker without granting any write right', async () => {
    renderShell()
    await openAccess()
    await saisirLeCode('joueur')
    expect(await screen.findByRole('button', { name: /MARTIN Lucas/ })).toBeInTheDocument()
    // Two independent axes: identifying yourself does not raise your rights.
    expect(screen.getByText(/accès en cours : visiteur/i)).toBeInTheDocument()
  })
})

describe('the administration entry', () => {
  it('stays invisible to a visitor and to the scorer\'s table', async () => {
    // A door you cannot open has no business showing: data cleanup is reserved for the
    // administrator.
    renderShell()
    const aside = await screen.findByRole('complementary')
    expect(within(aside).queryByRole('link', { name: /administration/i })).not.toBeInTheDocument()

    await openAccess()
    await saisirLeCode('marque')
    // The dialog is modal: while it is open, the rest of the page is hidden from role
    // queries and the link's absence would prove nothing.
    await closeAccess()
    expect(within(await screen.findByRole('complementary')).queryByRole('link', { name: /administration/i })).not.toBeInTheDocument()
  })

  it('appears under the access button as soon as the administrator code is entered', async () => {
    renderShell()
    await openAccess()
    await saisirLeCode('admin')
    await closeAccess()
    const aside = await screen.findByRole('complementary')
    const entry = within(aside).getByRole('link', { name: /administration/i })
    expect(entry).toHaveAttribute('href', '/admin')
  })
})

describe('the player\'s identity in the roster', () => {
  it('remembers the player chosen, without listing the roster in the sidebar', async () => {
    // The roster left the menu: thirteen names pushed the navigation off screen there.
    // Choosing a name does save the identity — it is the dashboard and the player's
    // record that show it now.
    renderShell()
    await openAccess()
    await saisirLeCode('joueur')
    await userEvent.click(await screen.findByRole('button', { name: /MARTIN Lucas/ }))

    await waitFor(() => expect(localStorage.getItem(PLAYER_ID_KEY)).toBe('p1'))
    const aside = await screen.findByRole('complementary')
    expect(within(aside).queryByText('Lucas MARTIN')).not.toBeInTheDocument()
    expect(within(aside).queryByText('Théo DURAND')).not.toBeInTheDocument()
  })

  it('forgets an id matching no player in the roster', async () => {
    // The player has been removed from the roster, but their id survives in
    // localStorage: the application must behave as if there were no identity. The
    // roster stays loaded by the shell for the name picker, even though it is no longer
    // displayed.
    localStorage.setItem(PLAYER_ID_KEY, 'parti')
    renderShell()

    await screen.findByRole('complementary')
    await waitFor(() => expect(localStorage.getItem(PLAYER_ID_KEY)).toBeNull())
  })
})
