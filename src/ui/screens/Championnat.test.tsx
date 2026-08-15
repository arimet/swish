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
 *  Le formulaire est replié : il faut d'abord l'ouvrir — un formulaire de saisie
 *  apparaît sur un clic, jamais d'emblée.
 *  Les équipes du club viennent d'un chargement asynchrone : on attend qu'elles
 *  soient là avant de choisir une valeur, sinon le select n'a que « — Choisir — ». */
const remplirFormulaire = async (home: string, away: string, hs: string, as_: string) => {
  await userEvent.click(await screen.findByRole('button', { name: /saisir un résultat/i }))
  await waitFor(() => expect((screen.getByLabelText('Équipe reçue') as HTMLSelectElement).options.length).toBeGreaterThan(1))
  await userEvent.selectOptions(screen.getByLabelText('Équipe reçue'), home)
  await userEvent.selectOptions(screen.getByLabelText('Équipe visiteuse'), away)
  await userEvent.clear(screen.getByLabelText('Score équipe reçue'))
  await userEvent.type(screen.getByLabelText('Score équipe reçue'), hs)
  await userEvent.clear(screen.getByLabelText('Score équipe visiteuse'))
  await userEvent.type(screen.getByLabelText('Score équipe visiteuse'), as_)
}

describe('Standings', () => {
  it('explains why the table is incomplete when nothing has been entered', async () => {
    renderChamp()
    expect(await screen.findByText(/aucun résultat saisi/i)).toBeInTheDocument()
  })

  it('brings an entered result into the table', async () => {
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('VERDUN')).toBeInTheDocument()
    expect(within(table).getByText('METZ')).toBeInTheDocument()
  })

  it('deletes an entered result', async () => {
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    await userEvent.click(await screen.findByRole('button', { name: /supprimer ce résultat/i }))
    await waitFor(async () => expect(await listResults()).toHaveLength(0))
  })

  it('does not change the saved score when the field is cleared and then left', async () => {
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

  it('says that the entered results stay on this device', async () => {
    renderChamp()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })

  it('refuses a result that would duplicate one already entered, even with the teams reversed', async () => {
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

  it('forbids adding while an entered score is negative', async () => {
    renderChamp()
    await remplirFormulaire('tb', 'tc', '-5', '60')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeDisabled()
  })

  it('forbids adding until the date is filled in', async () => {
    // Sans date, une même rencontre saisie une fois datée et une fois vide produirait
    // deux clés de confrontation distinctes et compterait deux fois au classement.
    renderChamp()
    await remplirFormulaire('tb', 'tc', '70', '60')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeEnabled()
  })

  it('warns, before saving, that an entered fixture matches one of our games', async () => {
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

describe('Standings — rights', () => {
  it('entering a result is administrative: the scorer\'s table sees neither button nor fields, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderChamp()
    await screen.findByText(/aucun résultat saisi/i)

    // Le bloc de saisie entier disparaît : une carte vide, sans bouton, ne dirait
    // rien — et plus rien ne réclame de code au clic.
    expect(screen.queryByRole('button', { name: /saisir un résultat/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Équipe reçue')).not.toBeInTheDocument()
    // Ce qui compte : rien n'est écrit en base.
    expect(await listResults()).toHaveLength(0)
  })

  it('shows the entry form only after a click', async () => {
    renderChamp()
    await screen.findByRole('button', { name: /saisir un résultat/i })
    expect(screen.queryByLabelText('Équipe reçue')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /saisir un résultat/i }))
    expect(screen.getByLabelText('Équipe reçue')).toBeInTheDocument()
  })

  it('leaves no corrected score on screen that the right does not allow: the scorer\'s table gets no field', async () => {
    // Le champ n'est pas contrôlé : React ne le réinitialise pas tout seul. S'il
    // s'ouvrait à la frappe sans le droit, un refus laisserait à l'écran une valeur
    // que la base n'a pas — et le classement juste au-dessus continuerait de compter
    // l'ancienne. Le score s'affiche donc en toutes lettres, sans champ à frapper.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    await screen.findByRole('table')

    expect(screen.queryByLabelText(/score verdun/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /supprimer ce résultat/i })).not.toBeInTheDocument()
    // Le résultat reste lisible dans sa ligne, et la base intacte.
    expect(within(screen.getByRole('listitem')).getByText(/70/)).toBeInTheDocument()
    expect((await listResults())[0].homeScore).toBe(70)
  })

  it('a visitor reads the standings without being asked for any code', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('VERDUN')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })
})
