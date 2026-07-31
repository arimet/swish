import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('affiche la page d’accueil (dashboard)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(/Rencontres/i).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/Swish/i).length).toBeGreaterThan(0)
  })
})
