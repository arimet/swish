import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SchemaView } from './SchemaView'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { savePlay } from '../../persistence/repositories'
import { newPlay, nextStep, type Play } from '../../domain/plays'

const deuxTemps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', false), name: 'Corner pour le 4' }
  return { ...s, steps: [s.steps[0], nextStep(s.steps[0])] }
}

beforeEach(async () => {
  sessionStorage.removeItem(ROLE_KEY)
  await db.plays.clear()
  await savePlay(deuxTemps())
})

const renderView = () =>
  render(
    <MemoryRouter initialEntries={['/schemas/s1']}>
      <AuthProvider>
        <Routes>
          <Route path="/schemas/:id" element={<SchemaView />} />
          <Route path="/schemas/:id/edit" element={<p>éditeur</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

describe('SchemaView — la consultation d’un schéma', () => {
  it('un visiteur consulte un schéma sans code', async () => {
    renderView()
    // Aucun rôle en session : le tableau s'affiche quand même, et rien ne demande
    // de code — l'invariant du projet 7, la lecture n'est jamais protégée.
    expect(await screen.findByRole('img', { name: 'tableau tactique — Corner pour le 4' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
  })

  it('le défilement des temps se borne aux extrémités', async () => {
    renderView()
    expect(await screen.findByText('Temps 1 / 2')).toBeInTheDocument()

    // Au premier temps, reculer ne fait rien : boucler jusqu'au dernier ferait
    // croire qu'il reste des temps devant. On vérifie ce que le doigt obtient —
    // le bouton est éteint, et le presser laisse le même temps affiché.
    const precedent = screen.getByRole('button', { name: 'Temps précédent' })
    expect(precedent).toBeDisabled()
    await userEvent.click(precedent)
    expect(screen.getByText('Temps 1 / 2')).toBeInTheDocument()

    const suivant = screen.getByRole('button', { name: 'Temps suivant' })
    await userEvent.click(suivant)
    expect(await screen.findByText('Temps 2 / 2')).toBeInTheDocument()

    // Au dernier temps, avancer ne fait rien non plus.
    expect(suivant).toBeDisabled()
    await userEvent.click(suivant)
    expect(screen.getByText('Temps 2 / 2')).toBeInTheDocument()
  })

  it('« Modifier » est réservé à l’administration : un visiteur ne le voit pas et n’atteint pas l’éditeur', async () => {
    renderView()
    await screen.findByRole('heading', { name: /corner pour le 4/i })

    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByText('éditeur')).not.toBeInTheDocument()
    // Ce qui reste libre le reste : jouer et partager ne modifient rien.
    expect(screen.getByRole('link', { name: /jouer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument()
  })

  it('l’administrateur, lui, atteint l’éditeur depuis « Modifier »', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    expect(await screen.findByText('éditeur')).toBeInTheDocument()
  })
})
