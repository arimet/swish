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
import { newPlay, type Play } from '../../domain/plays'
import type { Match } from '../../domain/types'

const mk = (id: string, clubId: string, opponentId: string, date = '2026-01-10'): Match => ({
  id, meta: { championshipLabel: 'Poule A', date, clubId, opponentId },
  roster: [], events: [], status: 'setup',
})

const schema = (id: string, name: string): Play => ({ id, ...newPlay('ta', 'half', false), name })

/** A date relative to the day of the run: the calendar's past and future are judged
 *  against the clock, and a hard-coded date would eventually tip to one side. */
const jour = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

describe('Calendar', () => {
  it('shows only the club\'s games', async () => {
    renderCal()
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.queryByText(/METZ/)).not.toBeInTheDocument()
  })

  it('shows a training in the same date group as that day\'s game', async () => {
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', time: '18:30', place: 'Gymnase Colette', theme: 'Défense sur écran' })
    renderCal()
    // Game m1 is already dated 10 January: the training must join its group, not form
    // a second list beside the calendar.
    const rencontre = await screen.findByText(/VERDUN/)
    const groupe = rencontre.closest('section')
    expect(groupe).not.toBeNull()
    expect(within(groupe!).getByText('Défense sur écran')).toBeInTheDocument()
    expect(within(groupe!).getByText('Gymnase Colette')).toBeInTheDocument()
    expect(within(groupe!).getByText(/^entraînement$/i)).toBeInTheDocument()
  })

  it('shows only the followed club\'s trainings', async () => {
    // A device that has changed club must not keep the previous club's trainings in the
    // calendar, mixed in unmarked with the current club's.
    await saveTraining({ id: 't-nous', clubId: 'ta', date: '2026-01-10', theme: 'Notre séance' })
    await saveTraining({ id: 't-eux', clubId: 'tc', date: '2026-01-10', theme: 'Séance de METZ' })
    renderCal()
    expect(await screen.findByText('Notre séance')).toBeInTheDocument()
    expect(screen.queryByText('Séance de METZ')).not.toBeInTheDocument()
  })

  it('at an equal time, the game comes before the training in the same group', async () => {
    // Départage explicite requis (cf. `nextFixture` dans src/domain/fixtures.ts) :
    // without it, two fixtures on the same date with no time would be ordered by
    // insertion, correct by accident and fragile at the first rearrangement.
    await saveMatch(mk('m3', 'ta', 'tc', '2026-03-01'))
    await saveTraining({ id: 't2', clubId: 'ta', date: '2026-03-01', theme: 'Départage' })
    renderCal()
    const rencontre = await screen.findByText(/METZ/)
    const groupe = rencontre.closest('section')
    expect(groupe).not.toBeNull()
    const text = groupe!.textContent ?? ''
    expect(text.indexOf('METZ')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Départage')).toBeGreaterThan(text.indexOf('METZ'))
  })

  it('fades the past, marks today, and leaves the future in full light', async () => {
    // The calendar reads from oldest to most recent: without this split, a whole
    // season of games played would compete for the eye with what is left to play.
    await saveTraining({ id: 'hier', clubId: 'ta', date: jour(-3), theme: 'Séance passée' })
    await saveTraining({ id: 'auj', clubId: 'ta', date: jour(0), theme: 'Séance du jour' })
    renderCal()

    // The fade is 0.75 and not 0.60: at 0.60 a past day's text fell to 4.63:1 on the
    // frame, three per cent above the AA threshold and 3.1:1 in rendered pixels. What
    // the test keeps is that there is a fade and that today has none — not its exact
    // value, which is a setting.
    const passé = (await screen.findByText('Séance passée')).closest('section')
    expect(passé).toHaveClass('opacity-75')

    const jourMême = screen.getByText('Séance du jour').closest('section')
    expect(jourMême?.className ?? '').not.toMatch(/opacity-/)
    expect(within(jourMême!).getByText(/^aujourd/i)).toBeInTheDocument()
  })

  it('points at the next fixture when nothing is scheduled today', async () => {
    // The same rule as on the dashboard: `nextFixture` is what says "what comes next".
    await db.matches.clear() // the fixture's games are dated and would skew the result
    await saveTraining({ id: 'plus-tard', clubId: 'ta', date: jour(10), theme: 'Séance à venir' })
    renderCal()

    const groupe = (await screen.findByText('Séance à venir')).closest('section')
    expect(within(groupe!).getByText(/prochaine échéance/i)).toBeInTheDocument()
  })

  it('says that the trainings stay on this device', async () => {
    renderCal()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })

  it('creates a training from the form and adds it to the calendar', async () => {
    renderCal()
    // The form is folded away: it appears on a click, never up front.
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

  it('deletes a training only after confirmation', async () => {
    // This test used to assert the opposite: that a click on the cross was enough. That
    // was the behaviour, and it was the defect — a session disappeared on a single click
    // while deleting a game, a play or a team asks for confirmation. The first half of
    // the test is therefore the new property, and the second the old one.
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    renderCal()
    await userEvent.click(await screen.findByRole('button', { name: /supprimer cet entraînement/i }))

    // The dialog opens and the session is still there.
    expect(await screen.findByText(/supprimer cette séance/i)).toBeInTheDocument()
    expect(await listTrainings()).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /^supprimer$/i }))
    // Deletion goes through `guard()`, which fires the action without awaiting it: the
    // erasure from the DOM and the store is asynchronous after the click.
    await waitFor(async () => expect(await listTrainings()).toHaveLength(0))
    expect(screen.queryByText('Défense sur écran')).not.toBeInTheDocument()
  })
})

describe('Calendar — the session\'s plays', () => {
  const ouvrirLesSchemas = async () =>
    userEvent.click(await screen.findByText(/schémas travaillés/i))

  it('attaches a play to the training, announces it on the row, and unticking removes it', async () => {
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderCal()
    await ouvrirLesSchemas()

    await userEvent.click(await screen.findByRole('checkbox', { name: /pick and roll haut/i }))
    // Attaching goes through `guard()`, which fires the action without awaiting it.
    await waitFor(async () => expect((await listTrainings())[0].playIds).toEqual(['s1']))
    expect(await screen.findByText(/1 schéma$/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /pick and roll haut/i }))
    await waitFor(async () => expect((await listTrainings())[0].playIds).toEqual([]))
    // The store wins the race against the re-render: querying the DOM straight after
    // sometimes reads it before React has updated it. We wait for the screen, not the
    // store — that is what we claim to be checking here.
    await waitFor(() => expect(screen.queryByText(/1 schéma$/)).not.toBeInTheDocument())
  })

  it('counts and ticks only the plays that still exist', async () => {
    // A training may cite a play deleted by a store older than `deletePlay`'s cascade:
    // the read filters on what exists, otherwise the count shown would lie — the same
    // fault fixed earlier on the call-ups.
    await savePlay(schema('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Séance', playIds: ['s1', 'disparu'] })
    renderCal()
    await ouvrirLesSchemas()

    expect(await screen.findByText(/1 schéma$/)).toBeInTheDocument()
    expect(screen.queryByText(/2 schémas/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: /pick and roll haut/i })).toBeChecked()
  })

  it('keeps both plays ticked in quick succession, without waiting for the reload', async () => {
    // At the sideline people tick fast: if every toggle started from the session as it
    // was at render time, the second write would erase the first.
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

  it('attaching a play is administrative: the scorer\'s table gets no checkbox, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran', playIds: ['s1'] })
    await savePlay(schema('s1', 'Pick and roll haut'))
    await savePlay(schema('s2', 'Corner pour le 4'))
    renderCal()
    await ouvrirLesSchemas()

    // It reads the session's programme — that is what interests it — but no box is
    // offered to it, hence no code prompt on a click.
    expect(await screen.findByText('Pick and roll haut')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    // And the whole library does not spread out: only the plays scheduled.
    expect(screen.queryByText('Corner pour le 4')).not.toBeInTheDocument()
    // What matters: the session has not moved.
    expect((await listTrainings())[0].playIds).toEqual(['s1'])
  })
})

describe('Calendar — rights', () => {
  it('planning is administrative: the scorer\'s table sees neither button nor form, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderCal()
    await screen.findByText(/VERDUN/)

    // Neither planning button is offered to it, hence no code prompt on a click. The
    // calendar itself reads in full.
    expect(screen.queryByRole('button', { name: /nouvel entraînement/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /nouvelle rencontre/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/date de l'entraînement/i)).not.toBeInTheDocument()
    // What matters: nothing is written to the store.
    expect(await listTrainings()).toHaveLength(0)
  })

  it('offers "New game" in the calendar, next to the new training', async () => {
    // The button left the header: dated things live in the calendar.
    renderCal()
    expect(await screen.findByRole('link', { name: /nouvelle rencontre/i })).toHaveAttribute('href', '/match/new')
  })

  it('shows the training form only after a click', async () => {
    renderCal()
    await screen.findByRole('button', { name: /nouvel entraînement/i })
    expect(screen.queryByLabelText(/date de l'entraînement/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /nouvel entraînement/i }))
    expect(await screen.findByLabelText(/date de l'entraînement/i)).toBeInTheDocument()
  })


  it('gives access to the call-up from an upcoming game\'s card', async () => {
    // The coach looks at the calendar, not the record: that is where they must be able
    // to call up from, without having to guess that the call-up lives on the record.
    renderCal()
    expect(await screen.findByRole('link', { name: /convoquer/i })).toHaveAttribute('href', '/match/m1#convocation')
  })

  it('does not offer to call up for a game already played', async () => {
    await db.matches.clear()
    await saveMatch({ ...mk('m9', 'ta', 'tb'), status: 'finished' })
    renderCal()
    await screen.findByText(/VERDUN/)
    expect(screen.queryByRole('link', { name: /convoquer/i })).not.toBeInTheDocument()
  })

  it('a visitor reads the calendar without being asked for any code', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-01-10', theme: 'Défense sur écran' })
    renderCal()
    expect(await screen.findByText('Défense sur écran')).toBeInTheDocument()
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
    // Nothing that writes is shown to them: no planning, no calling up, no
    // supprimer une séance.
    expect(screen.queryByRole('link', { name: /convoquer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /supprimer cet entraînement/i })).not.toBeInTheDocument()
  })
})
