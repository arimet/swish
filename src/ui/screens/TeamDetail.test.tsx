import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamDetail } from './TeamDetail'
import { AdminProvider } from '../../app/admin'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listPlayers, savePlayer, saveTeam } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1')
  await db.teams.clear(); await db.players.clear(); await db.matches.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
})

const renderTeam = () =>
  render(
    <MemoryRouter initialEntries={['/teams/ta']}>
      <ClubProvider>
        <AdminProvider>
          <Routes><Route path="/teams/:id" element={<TeamDetail />} /></Routes>
        </AdminProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

describe('TeamDetail — fiche signalétique', () => {
  it('renseigne la date de naissance sans changer l’identifiant du joueur', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.type(screen.getByLabelText(/date de naissance/i), '2000-06-15')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    await waitFor(async () => {
      const [p] = await listPlayers('ta')
      // L'identifiant doit survivre : il porte tout l'historique de tirs du joueur.
      expect(p.id).toBe('p1')
      expect(p.birthDate).toBe('2000-06-15')
    })
  })

  it('renseigne la taille', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.type(screen.getByLabelText(/taille/i), '192')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(async () => expect((await listPlayers('ta'))[0].height).toBe(192))
  })

  it('ajoute un joueur avec sa date de naissance et sa taille', async () => {
    renderTeam()
    await userEvent.type(await screen.findByPlaceholderText('N°'), '9')
    await userEvent.type(screen.getByPlaceholderText('Nom'), 'DUPONT')
    await userEvent.type(screen.getByLabelText(/date de naissance/i), '1998-03-02')
    await userEvent.type(screen.getByLabelText(/taille/i), '201')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le joueur/i }))

    await waitFor(async () => {
      const ajoute = (await listPlayers('ta')).find((p) => p.lastName === 'DUPONT')
      expect(ajoute?.birthDate).toBe('1998-03-02')
      expect(ajoute?.height).toBe(201)
    })
  })
})
