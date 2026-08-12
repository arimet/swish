import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Championnat } from './Championnat'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listResults, saveMatch, saveResult, saveTeam } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await db.teams.clear(); await db.matches.clear(); await db.results.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveTeam({ id: 'tc', name: 'METZ' })
  localStorage.setItem('swish-club-id', 'ta')
})

const renderChamp = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><Championnat /></AuthProvider></ClubProvider></MemoryRouter>)

/** Sélectionne les équipes et scores du formulaire de saisie, sans valider.
 *  Les équipes du club viennent d'un chargement asynchrone : on attend qu'elles
 *  soient là avant de choisir une valeur, sinon le select n'a que « — Choisir — ». */
const remplirFormulaire = async (home: string, away: string, hs: string, as_: string) => {
  await waitFor(() => expect((screen.getByLabelText('Équipe reçue') as HTMLSelectElement).options.length).toBeGreaterThan(1))
  await userEvent.selectOptions(screen.getByLabelText('Équipe reçue'), home)
  await userEvent.selectOptions(screen.getByLabelText('Équipe visiteuse'), away)
  await userEvent.clear(screen.getByLabelText('Score équipe reçue'))
  await userEvent.type(screen.getByLabelText('Score équipe reçue'), hs)
  await userEvent.clear(screen.getByLabelText('Score équipe visiteuse'))
  await userEvent.type(screen.getByLabelText('Score équipe visiteuse'), as_)
}

describe('Championnat', () => {
  it('explique pourquoi le classement est incomplet quand rien n’est saisi', async () => {
    renderChamp()
    expect(await screen.findByText(/aucun résultat saisi/i)).toBeInTheDocument()
  })

  it('fait apparaître au classement un résultat saisi', async () => {
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('VERDUN')).toBeInTheDocument()
    expect(within(table).getByText('METZ')).toBeInTheDocument()
  })

  it('supprime un résultat saisi', async () => {
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    await userEvent.click(await screen.findByRole('button', { name: /supprimer ce résultat/i }))
    await waitFor(async () => expect(await listResults()).toHaveLength(0))
  })

  it('ne modifie pas le score enregistré quand on vide le champ puis qu’on en sort', async () => {
    // Vider le champ est le premier geste de qui corrige une faute de frappe : ça ne
    // doit pas enregistrer 0 en silence (`Number('')` vaut 0, pas NaN).
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    const scoreHome = await screen.findByLabelText(/score verdun/i)
    await userEvent.clear(scoreHome)
    await userEvent.click(document.body)
    expect((await listResults())[0].homeScore).toBe(70)
    expect(scoreHome).toHaveValue(70)
  })

  it('signale que les résultats saisis restent sur cet appareil', async () => {
    renderChamp()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })

  it('refuse un résultat qui ferait doublon avec un résultat déjà saisi, même équipes inversées', async () => {
    // « VERDUN reçoit METZ » est déjà saisi : le saisir à nouveau dans l'autre sens
    // (METZ reçoit VERDUN, même championnat, même date) décrit la même confrontation.
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    await screen.findByRole('table')
    await remplirFormulaire('tc', 'tb', '55', '80')
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')
    await userEvent.clear(screen.getByLabelText('Championnat'))
    await userEvent.type(screen.getByLabelText('Championnat'), 'Poule A')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le résultat/i }))

    expect(await screen.findByText(/déjà saisi/i)).toBeInTheDocument()
    expect(await listResults()).toHaveLength(1)
  })

  it('interdit l’ajout tant qu’un score saisi est négatif', async () => {
    renderChamp()
    await remplirFormulaire('tb', 'tc', '-5', '60')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeDisabled()
  })

  it('interdit l’ajout tant que la date n’est pas renseignée', async () => {
    // Sans date, une même rencontre saisie une fois datée et une fois vide produirait
    // deux clés de confrontation distinctes et compterait deux fois au classement.
    renderChamp()
    await remplirFormulaire('tb', 'tc', '70', '60')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeEnabled()
  })

  it('signale, avant l’enregistrement, qu’une confrontation saisie correspond à une de nos rencontres', async () => {
    await saveMatch({
      id: 'm1',
      meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
      roster: [], events: [], status: 'finished',
    })
    renderChamp()
    await remplirFormulaire('ta', 'tb', '10', '5')
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')

    expect(await screen.findByText(/correspond déjà à une de nos rencontres/i)).toBeInTheDocument()
  })
})

describe('Championnat — droits', () => {
  it('saisir un résultat est administratif : la table de marque se voit demander le code admin', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderChamp()
    await remplirFormulaire('tb', 'tc', '70', '60')
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le résultat/i }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect(await listResults()).toHaveLength(0)
  })

  it('un visiteur consulte le classement sans qu’aucun code lui soit demandé', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('VERDUN')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })
})
