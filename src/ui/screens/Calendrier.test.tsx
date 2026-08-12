import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Calendrier } from './Calendrier'
import { AdminProvider } from '../../app/admin'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listTrainings, saveMatch, saveTeam, saveTraining } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const mk = (id: string, clubId: string, opponentId: string): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId, opponentId },
  roster: [], events: [], status: 'setup',
})

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1')
  localStorage.clear()
  await db.matches.clear(); await db.teams.clear(); await db.trainings.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveTeam({ id: 'tc', name: 'METZ' })
  await saveMatch(mk('m1', 'ta', 'tb'))
  await saveMatch(mk('m2', 'tc', 'tb')) // rencontre sans notre club
  localStorage.setItem('swish-club-id', 'ta')
})

const renderCal = () =>
  render(<MemoryRouter><ClubProvider><AdminProvider><Calendrier /></AdminProvider></ClubProvider></MemoryRouter>)

describe('Calendrier', () => {
  it('n’affiche que les rencontres du club', async () => {
    renderCal()
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.queryByText(/METZ/)).not.toBeInTheDocument()
  })

  it('affiche un entraînement enregistré à côté des rencontres, à sa date', async () => {
    await saveTraining({ id: 't1', date: '2026-01-10', time: '18:30', place: 'Gymnase Colette', theme: 'Défense sur écran' })
    renderCal()
    // Même groupe de date que la rencontre m1, déjà datée du 10 janvier.
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.getByText('Défense sur écran')).toBeInTheDocument()
    expect(screen.getByText('Gymnase Colette')).toBeInTheDocument()
    expect(screen.getByText(/^entraînement$/i)).toBeInTheDocument()
  })

  it('crée un entraînement depuis le formulaire et l’ajoute au calendrier', async () => {
    renderCal()
    await userEvent.type(await screen.findByLabelText(/date de l'entraînement/i), '2026-02-03')
    await userEvent.type(screen.getByLabelText(/^heure$/i), '19:00')
    await userEvent.type(screen.getByLabelText(/^lieu$/i), 'Gymnase des Tilleuls')
    await userEvent.type(screen.getByLabelText(/^thème$/i), 'Tirs extérieurs')
    await userEvent.click(screen.getByRole('button', { name: /ajouter l'entraînement/i }))

    expect(await screen.findByText('Tirs extérieurs')).toBeInTheDocument()
    const enregistrés = await listTrainings()
    expect(enregistrés).toHaveLength(1)
    expect(enregistrés[0]).toMatchObject({ date: '2026-02-03', time: '19:00', place: 'Gymnase des Tilleuls', theme: 'Tirs extérieurs' })
  })

  it('supprime un entraînement', async () => {
    await saveTraining({ id: 't1', date: '2026-01-10', theme: 'Défense sur écran' })
    renderCal()
    await userEvent.click(await screen.findByRole('button', { name: /supprimer cet entraînement/i }))

    expect(screen.queryByText('Défense sur écran')).not.toBeInTheDocument()
    expect(await listTrainings()).toHaveLength(0)
  })
})
