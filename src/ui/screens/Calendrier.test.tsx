import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Calendrier } from './Calendrier'
import { AdminProvider } from '../../app/admin'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listTrainings, saveMatch, saveTeam, saveTraining } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const mk = (id: string, clubId: string, opponentId: string, date = '2026-01-10'): Match => ({
  id, meta: { championshipLabel: 'Poule A', date, clubId, opponentId },
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

  it('affiche un entraînement dans le même conteneur de date que la rencontre du jour', async () => {
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', time: '18:30', place: 'Gymnase Colette', theme: 'Défense sur écran' })
    renderCal()
    // La rencontre m1 est déjà datée du 10 janvier : l'entraînement doit rejoindre
    // son groupe, pas former une seconde liste à côté du calendrier.
    const rencontre = await screen.findByText(/VERDUN/)
    const groupe = rencontre.closest('section')
    expect(groupe).not.toBeNull()
    expect(within(groupe!).getByText('Défense sur écran')).toBeInTheDocument()
    expect(within(groupe!).getByText('Gymnase Colette')).toBeInTheDocument()
    expect(within(groupe!).getByText(/^entraînement$/i)).toBeInTheDocument()
  })

  it('n’affiche que les entraînements du club suivi', async () => {
    // Un appareil qui a changé de club ne doit pas garder au calendrier les
    // entraînements du club précédent, mêlés sans signal à ceux du club courant.
    await saveTraining({ id: 't-nous', clubId: 'ta', date: '2026-01-10', theme: 'Notre séance' })
    await saveTraining({ id: 't-eux', clubId: 'tc', date: '2026-01-10', theme: 'Séance de METZ' })
    renderCal()
    expect(await screen.findByText('Notre séance')).toBeInTheDocument()
    expect(screen.queryByText('Séance de METZ')).not.toBeInTheDocument()
  })

  it('à heure égale, la rencontre passe avant l’entraînement dans le même groupe', async () => {
    // Départage explicite requis (cf. `nextFixture` dans src/domain/fixtures.ts) :
    // sans lui, deux échéances de même date et sans heure se classeraient selon
    // l'ordre d'insertion, correct par accident et fragile au premier réarrangement.
    await saveMatch(mk('m3', 'ta', 'tc', '2026-03-01'))
    await saveTraining({ id: 't2', clubId: 'ta', date: '2026-03-01', theme: 'Départage' })
    renderCal()
    const rencontre = await screen.findByText(/METZ/)
    const groupe = rencontre.closest('section')
    expect(groupe).not.toBeNull()
    const texte = groupe!.textContent ?? ''
    expect(texte.indexOf('METZ')).toBeGreaterThanOrEqual(0)
    expect(texte.indexOf('Départage')).toBeGreaterThan(texte.indexOf('METZ'))
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
    expect(enregistrés[0]).toMatchObject({ clubId: 'ta', date: '2026-02-03', time: '19:00', place: 'Gymnase des Tilleuls', theme: 'Tirs extérieurs' })
  })

  it('supprime un entraînement', async () => {
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    renderCal()
    await userEvent.click(await screen.findByRole('button', { name: /supprimer cet entraînement/i }))

    // La suppression passe par `guard()`, qui déclenche l'action sans l'attendre :
    // l'effacement du DOM et de la base est asynchrone après le clic.
    await waitFor(async () => expect(await listTrainings()).toHaveLength(0))
    expect(screen.queryByText('Défense sur écran')).not.toBeInTheDocument()
  })
})
