import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
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
