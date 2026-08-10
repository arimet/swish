import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { db } from './persistence/db'
import { saveTeam } from './persistence/repositories'

beforeEach(async () => {
  // Un club doit être réglé pour atteindre le shell : sans ça, App affiche
  // l'écran de bienvenue au lieu du tableau de bord attendu par ce test.
  await saveTeam({ id: 'app-test-club', name: 'CLUB TEST' })
  localStorage.setItem('swish-club-id', 'app-test-club')
})

describe('App', () => {
  it('affiche la page d’accueil (dashboard)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(/Rencontres/i).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/Swish/i).length).toBeGreaterThan(0)
  })
})

describe('premier lancement (appareil vierge)', () => {
  beforeEach(async () => {
    // Personne ne rejoue jamais ce parcours une fois des données de démo en place :
    // aucun club réglé, et aucune équipe en base pour en proposer un.
    localStorage.clear()
    await db.teams.clear()
  })

  it('mène de l’écran de bienvenue jusqu’au formulaire de création d’équipe', async () => {
    render(<App />)
    const link = await screen.findByRole('link', { name: /créer ma première équipe/i })
    await userEvent.click(link)
    // La route de création doit rester joignable sans club réglé, sinon
    // l'utilisateur tourne en rond entre l'écran de bienvenue et lui-même.
    expect(await screen.findByText(/nommez l.équipe/i)).toBeInTheDocument()
    expect(screen.queryByText(/bienvenue sur swish/i)).not.toBeInTheDocument()
  })
})
