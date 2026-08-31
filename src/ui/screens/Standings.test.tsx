import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Standings } from './Standings'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { listResults, saveMatch, saveResult, saveTeam } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveTeam({ id: 'tc', name: 'METZ' })
  localStorage.setItem('swish-club-id', 'ta')
})

const renderChamp = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><Standings /></AuthProvider></ClubProvider></MemoryRouter>)

/** Selects the teams and scores in the entry form, without submitting.
 *  The form is folded away: it has to be opened first — an entry form appears on a
 *  click, never up front.
 *  The club's teams come from an asynchronous load: we wait for them to be there
 *  before choosing a value, otherwise the select only holds "— Choisir —". */
const fillForm = async (home: string, away: string, hs: string, as_: string) => {
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
    // Clearing the field is the first gesture of someone correcting a typo: it must not
    // silently save 0 (`Number('')` is 0, not NaN).
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    const scoreHome = await screen.findByLabelText(/score verdun/i)
    await userEvent.clear(scoreHome)
    await userEvent.click(document.body)
    expect((await listResults())[0].homeScore).toBe(70)
    expect(scoreHome).toHaveValue(70)
  })

  it('refuses a result that would duplicate one already entered, even with the teams reversed', async () => {
    // "VERDUN hosts METZ" is already entered: entering it again the other way round
    // (METZ reçoit VERDUN, même championnat, même date) décrit la même confrontation.
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    await screen.findByRole('table')
    await fillForm('tc', 'tb', '55', '80')
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')
    await userEvent.clear(screen.getByLabelText('Championnat'))
    await userEvent.type(screen.getByLabelText('Championnat'), 'Poule A')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le résultat/i }))

    expect(await screen.findByText(/déjà saisi/i)).toBeInTheDocument()
    expect(await listResults()).toHaveLength(1)
  })

  it('forbids adding while an entered score is negative', async () => {
    renderChamp()
    await fillForm('tb', 'tc', '-5', '60')
    expect(screen.getByRole('button', { name: /ajouter le résultat/i })).toBeDisabled()
  })

  it('forbids adding until the date is filled in', async () => {
    // With no date, the same game entered once dated and once blank would produce two
    // distinct fixture keys and count twice in the standings.
    renderChamp()
    await fillForm('tb', 'tc', '70', '60')
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
    await fillForm('ta', 'tb', '10', '5')
    await userEvent.type(screen.getByLabelText('Date de la rencontre'), '2026-01-10')

    expect(await screen.findByText(/correspond déjà à une de nos rencontres/i)).toBeInTheDocument()
  })
})

describe('Standings — rights', () => {
  it('entering a result is administrative: the scorer\'s table sees neither button nor fields, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderChamp()
    await screen.findByText(/aucun résultat saisi/i)

    // The whole entry block disappears: an empty card with no button would say nothing
    // — and nothing demands a code on a click any more.
    expect(screen.queryByRole('button', { name: /saisir un résultat/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Équipe reçue')).not.toBeInTheDocument()
    // What matters: nothing is written to the store.
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
    // The field is uncontrolled: React does not reset it on its own. If it opened to
    // typing without the right, a refusal would leave on screen a value the store does
    // not have — and the standings just above would keep counting the old one. The
    // score is therefore shown as plain text, with no field to type into.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    renderChamp()
    await screen.findByRole('table')

    expect(screen.queryByLabelText(/score verdun/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /supprimer ce résultat/i })).not.toBeInTheDocument()
    // The result stays readable in its row, and the store intact.
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
