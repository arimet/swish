import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Calendrier } from './Calendrier'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listTrainings, saveMatch, savePlay, saveTeam, saveTraining } from '../../persistence/repositories'
import { nouveauSchema, type Schema } from '../../domain/plays'
import type { Match } from '../../domain/types'

const mk = (id: string, clubId: string, opponentId: string, date = '2026-01-10'): Match => ({
  id, meta: { championshipLabel: 'Poule A', date, clubId, opponentId },
  roster: [], events: [], status: 'setup',
})

const schema = (id: string, nom: string): Schema => ({ id, ...nouveauSchema('ta', 'demi', false), nom })

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await db.matches.clear(); await db.teams.clear(); await db.trainings.clear(); await db.plays.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveTeam({ id: 'tc', name: 'METZ' })
  await saveMatch(mk('m1', 'ta', 'tb'))
  await saveMatch(mk('m2', 'tc', 'tb')) // rencontre sans notre club
  localStorage.setItem('swish-club-id', 'ta')
})

const renderCal = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><Calendrier /></AuthProvider></ClubProvider></MemoryRouter>)

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

  it('signale que les entraînements restent sur cet appareil', async () => {
    renderCal()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })

  it('crée un entraînement depuis le formulaire et l’ajoute au calendrier', async () => {
    renderCal()
    // Le formulaire est replié : il apparaît sur un clic, jamais d'emblée.
    await userEvent.click(await screen.findByRole('button', { name: /nouvel entraînement/i }))
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

describe('Calendrier — les schémas de la séance', () => {
  const ouvrirLesSchemas = async () =>
    userEvent.click(await screen.findByText(/schémas travaillés/i))

  it('attache un schéma à l’entraînement, l’annonce sur la ligne, et le décochage le retire', async () => {
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderCal()
    await ouvrirLesSchemas()

    await userEvent.click(await screen.findByRole('checkbox', { name: /pick and roll haut/i }))
    // L'attache passe par `guard()`, qui déclenche l'action sans l'attendre.
    await waitFor(async () => expect((await listTrainings())[0].playIds).toEqual(['s1']))
    expect(await screen.findByText(/1 schéma$/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /pick and roll haut/i }))
    await waitFor(async () => expect((await listTrainings())[0].playIds).toEqual([]))
    // La base gagne la course sur le re-rendu : interroger le DOM dans la foulée
    // le lit parfois avant que React l'ait mis à jour. On attend l'écran, pas la
    // base — c'est ce qu'on prétend vérifier ici.
    await waitFor(() => expect(screen.queryByText(/1 schéma$/)).not.toBeInTheDocument())
  })

  it('ne compte et ne coche que les schémas qui existent encore', async () => {
    // Un entraînement peut citer un schéma supprimé par une base plus ancienne que la
    // cascade de `deletePlay` : la lecture filtre sur ce qui existe, sans quoi le
    // compte affiché mentirait — la faute corrigée au projet 6 sur les convocations.
    await savePlay(schema('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Séance', playIds: ['s1', 'disparu'] })
    renderCal()
    await ouvrirLesSchemas()

    expect(await screen.findByText(/1 schéma$/)).toBeInTheDocument()
    expect(screen.queryByText(/2 schémas/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: /pick and roll haut/i })).toBeChecked()
  })

  it('garde les deux schémas cochés coup sur coup, sans attendre le rechargement', async () => {
    // Au bord du terrain on coche vite : si chaque bascule partait de la séance telle
    // qu'elle était au rendu, la seconde écriture effacerait la première.
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Séance' })
    await savePlay(schema('s1', 'Pick and roll haut'))
    await savePlay(schema('s2', 'Corner pour le 4'))
    renderCal()
    await ouvrirLesSchemas()

    fireEvent.click(await screen.findByRole('checkbox', { name: /pick and roll haut/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /corner pour le 4/i }))
    await waitFor(async () => expect((await listTrainings())[0].playIds).toHaveLength(2))
    expect([...(await listTrainings())[0].playIds!].sort()).toEqual(['s1', 's2'])
  })

  it('attacher un schéma est administratif : la table de marque se voit demander le code admin', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderCal()
    await ouvrirLesSchemas()
    await userEvent.click(await screen.findByRole('checkbox', { name: /pick and roll haut/i }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect((await listTrainings())[0].playIds).toBeUndefined()
  })
})

describe('Calendrier — droits', () => {
  it('créer un entraînement est administratif : la table de marque se voit demander le code admin', async () => {
    // Le formulaire étant replié, la garde se déclenche dès son ouverture : la table
    // de marque voit la demande de code, pas les champs.
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderCal()
    await userEvent.click(await screen.findByRole('button', { name: /nouvel entraînement/i }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/date de l'entraînement/i)).not.toBeInTheDocument()
    expect(await listTrainings()).toHaveLength(0)
  })

  it('n’affiche le formulaire d’entraînement qu’après un clic', async () => {
    renderCal()
    await screen.findByRole('button', { name: /nouvel entraînement/i })
    expect(screen.queryByLabelText(/date de l'entraînement/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /nouvel entraînement/i }))
    expect(await screen.findByLabelText(/date de l'entraînement/i)).toBeInTheDocument()
  })


  it('un visiteur consulte le calendrier sans qu’aucun code lui soit demandé', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    renderCal()
    expect(await screen.findByText('Défense sur écran')).toBeInTheDocument()
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })
})
