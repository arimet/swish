import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { ROLE_KEY } from './app/auth'
import { db } from './persistence/db'
import { saveTeam } from './persistence/repositories'

beforeEach(async () => {
  // Un club doit être réglé pour atteindre le shell : sans ça, App affiche
  // l'écran de bienvenue au lieu du tableau de bord attendu par ce test.
  await saveTeam({ id: 'app-test-club', name: 'CLUB TEST' })
  localStorage.setItem('swish-club-id', 'app-test-club')
  sessionStorage.clear()
})

describe('App', () => {
  it('affiche la page d’accueil (dashboard)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(/Tableau de bord/i).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/Swish/i).length).toBeGreaterThan(0)
  })

  it('« Changer de club » ramène à l’écran de bienvenue, pas à une page vide', async () => {
    render(<App />)
    const button = await screen.findByRole('button', { name: /changer de club/i })
    await userEvent.click(button)
    expect(await screen.findByText(/bienvenue sur swish/i)).toBeInTheDocument()
  })

  it('supprimer sa propre équipe ramène à l’écran de bienvenue, pas à un club fantôme', async () => {
    // ClubProvider ne revalide sa liste d'équipes qu'à un changement de club :
    // sans le clear() dans TeamDetail, le tableau de bord resterait épinglé
    // sur ce club supprimé avec un effectif vide.
    sessionStorage.setItem(ROLE_KEY, 'admin')
    render(<App />)
    // « Mon équipe » apparaît deux fois dans le DOM (barre latérale + nav basse
    // mobile) : jsdom ne masque pas la seconde via `lg:hidden`, faute de media
    // queries. Les deux mènent à la même route, n'importe laquelle convient.
    const teamLinks = await screen.findAllByRole('link', { name: /mon équipe/i })
    await userEvent.click(teamLinks[0])
    await screen.findByRole('heading', { name: /club test/i })

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    const confirmButtons = await screen.findAllByRole('button', { name: 'Supprimer' })
    await userEvent.click(confirmButtons[confirmButtons.length - 1])

    expect(await screen.findByText(/bienvenue sur swish/i)).toBeInTheDocument()
  })
})

describe('premier lancement (appareil vierge)', () => {
  beforeEach(async () => {
    // Personne ne rejoue jamais ce parcours une fois des données de démo en place :
    // aucun club réglé, et aucune équipe en base pour en proposer un.
    localStorage.clear()
    await db.teams.clear()
    // La création d'équipe est une action admin (guard) : on la déverrouille
    // pour tester le parcours plutôt que la boîte de mot de passe.
    sessionStorage.setItem(ROLE_KEY, 'admin')
  })

  it('mène de l’écran de bienvenue jusqu’au tableau de bord, en passant par la création d’équipe', async () => {
    render(<App />)
    const link = await screen.findByRole('link', { name: /créer ma première équipe/i })
    await userEvent.click(link)
    // La route de création doit rester joignable sans club réglé, sinon
    // l'utilisateur tourne en rond entre l'écran de bienvenue et lui-même.
    expect(await screen.findByText(/nommez l.équipe/i)).toBeInTheDocument()
    expect(screen.queryByText(/bienvenue sur swish/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'NOUVEAU CLUB')
    await userEvent.click(screen.getByRole('button', { name: /créer l.équipe/i }))

    // L'équipe tout juste créée doit devenir le club suivi et mener à
    // l'application — pas de retour à l'écran de bienvenue faute de
    // revalidation de la liste des équipes par ClubProvider.
    expect(await screen.findByRole('heading', { name: /nouveau club/i })).toBeInTheDocument()
    expect(screen.queryByText(/bienvenue sur swish/i)).not.toBeInTheDocument()
  })
})
