import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { OliveShell } from './OliveShell'
import { AuthProvider, PLAYER_ID_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
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

/** Le point d'entrée des accès existe en deux exemplaires (en-tête mobile et
 *  barre latérale) : on passe toujours par celui de la barre latérale. */
const ouvrirLesAcces = async () => {
  const aside = await screen.findByRole('complementary')
  await userEvent.click(within(aside).getByRole('button', { name: /accès/i }))
}

/** Le dialogue d'accès est modal : ce qui est derrière lui reste inatteignable
 *  aux requêtes par rôle tant qu'il n'est pas refermé. */
const fermerLesAcces = async () => {
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
  await db.teams.clear(); await db.players.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  await savePlayer({ id: 'p2', teamId: 'ta', number: 9, lastName: 'DURAND', firstName: 'Théo' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('point d’entrée des accès', () => {
  it('indique le rôle en cours, en prend un autre sur saisie du code, et se verrouille', async () => {
    renderShell()
    await ouvrirLesAcces()
    expect(await screen.findByText(/accès en cours : visiteur/i)).toBeInTheDocument()

    await saisirLeCode('marque')
    expect(await screen.findByText(/accès en cours : table de marque/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /se verrouiller/i }))
    expect(await screen.findByText(/accès en cours : visiteur/i)).toBeInTheDocument()
  })

  it('refuse un code inconnu sans changer le rôle en cours', async () => {
    renderShell()
    await ouvrirLesAcces()
    await saisirLeCode('n-importe-quoi')
    expect(await screen.findByText(/code inconnu/i)).toBeInTheDocument()
    expect(screen.getByText(/accès en cours : visiteur/i)).toBeInTheDocument()
  })

  it('le code joueur ouvre le choix du nom sans accorder le moindre droit d’écriture', async () => {
    renderShell()
    await ouvrirLesAcces()
    await saisirLeCode('joueur')
    expect(await screen.findByRole('button', { name: /MARTIN Lucas/ })).toBeInTheDocument()
    // Deux axes indépendants : s'identifier ne fait pas monter en droits.
    expect(screen.getByText(/accès en cours : visiteur/i)).toBeInTheDocument()
  })
})

describe('entrée d’administration', () => {
  it('reste invisible pour un visiteur et pour la table de marque', async () => {
    // Une porte qu'on ne peut pas ouvrir n'a pas à s'afficher : le ménage des
    // données est réservé à l'administrateur.
    renderShell()
    const aside = await screen.findByRole('complementary')
    expect(within(aside).queryByRole('link', { name: /administration/i })).not.toBeInTheDocument()

    await ouvrirLesAcces()
    await saisirLeCode('marque')
    // Le dialogue est modal : tant qu'il est ouvert, le reste de la page est
    // masqué aux requêtes par rôle et l'absence du lien ne prouverait rien.
    await fermerLesAcces()
    expect(within(await screen.findByRole('complementary')).queryByRole('link', { name: /administration/i })).not.toBeInTheDocument()
  })

  it('apparaît sous le bouton d’accès dès que le code administrateur est saisi', async () => {
    renderShell()
    await ouvrirLesAcces()
    await saisirLeCode('admin')
    await fermerLesAcces()
    const aside = await screen.findByRole('complementary')
    const entrée = within(aside).getByRole('link', { name: /administration/i })
    expect(entrée).toHaveAttribute('href', '/admin')
  })
})

describe('identité du joueur dans l’effectif', () => {
  it('retient le joueur choisi, sans lister l’effectif dans la barre latérale', async () => {
    // L'effectif a quitté le menu : treize noms y poussaient la navigation hors de
    // l'écran. Choisir son nom enregistre bien l'identité — c'est le tableau de
    // bord et la fiche du joueur qui la montrent désormais.
    renderShell()
    await ouvrirLesAcces()
    await saisirLeCode('joueur')
    await userEvent.click(await screen.findByRole('button', { name: /MARTIN Lucas/ }))

    await waitFor(() => expect(localStorage.getItem(PLAYER_ID_KEY)).toBe('p1'))
    const aside = await screen.findByRole('complementary')
    expect(within(aside).queryByText('Lucas MARTIN')).not.toBeInTheDocument()
    expect(within(aside).queryByText('Théo DURAND')).not.toBeInTheDocument()
  })

  it('oublie un identifiant qui ne correspond à aucun joueur de l’effectif', async () => {
    // Le joueur a été retiré de l'effectif, mais son identifiant survit dans le
    // localStorage : l'application doit se comporter comme sans identité. L'effectif
    // reste chargé par la coquille pour le choix du nom, même s'il n'est plus affiché.
    localStorage.setItem(PLAYER_ID_KEY, 'parti')
    renderShell()

    await screen.findByRole('complementary')
    await waitFor(() => expect(localStorage.getItem(PLAYER_ID_KEY)).toBeNull())
  })
})
