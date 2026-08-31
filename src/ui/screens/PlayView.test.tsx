import { render, screen } from '../../test/render'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayView } from './PlayView'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { savePlay } from '../../persistence/repositories'
import { newPlay, nextStep, type Play } from '../../domain/plays'

const twoSteps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', false), name: 'Corner pour le 4' }
  return { ...s, steps: [s.steps[0], nextStep(s.steps[0])] }
}

beforeEach(async () => {
  sessionStorage.removeItem(ROLE_KEY)
  await savePlay(twoSteps())
})

const renderView = () =>
  render(
    <MemoryRouter initialEntries={['/schemas/s1']}>
      <AuthProvider>
        <Routes>
          <Route path="/schemas/:id" element={<PlayView />} />
          <Route path="/schemas/:id/edit" element={<p>éditeur</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

describe('SchemaView — reading a play', () => {
  it('a visitor reads a play without a code', async () => {
    renderView()
    // No role in the session: the board shows all the same, and nothing asks for a
    // code — the rights invariant, reading is never gated.
    expect(await screen.findByRole('img', { name: 'tableau tactique — Corner pour le 4' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
  })

  it('stepping through is clamped at the ends', async () => {
    renderView()
    expect(await screen.findByText('Temps 1 / 2')).toBeInTheDocument()

    // On the first step, going back does nothing: wrapping to the last would suggest
    // there are steps ahead. We check what the finger gets — the button is dark, and
    // pressing it leaves the same step displayed.
    const precedent = screen.getByRole('button', { name: 'Temps précédent' })
    expect(precedent).toBeDisabled()
    await userEvent.click(precedent)
    expect(screen.getByText('Temps 1 / 2')).toBeInTheDocument()

    const suivant = screen.getByRole('button', { name: 'Temps suivant' })
    await userEvent.click(suivant)
    expect(await screen.findByText('Temps 2 / 2')).toBeInTheDocument()

    // On the last step, going forward does nothing either.
    expect(suivant).toBeDisabled()
    await userEvent.click(suivant)
    expect(screen.getByText('Temps 2 / 2')).toBeInTheDocument()
  })

  it('"Edit" is reserved for administration: a visitor does not see it and does not reach the editor', async () => {
    renderView()
    await screen.findByRole('heading', { name: /corner pour le 4/i })

    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByText('éditeur')).not.toBeInTheDocument()
    // What stays ungated stays so: playing and sharing modify nothing.
    expect(screen.getByRole('link', { name: /jouer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument()
  })

  it('the administrator, for their part, reaches the editor from "Edit"', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    expect(await screen.findByText('éditeur')).toBeInTheDocument()
  })
})
