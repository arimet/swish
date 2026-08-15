import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Admin } from './Admin'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { newPlay } from '../../domain/plays'
import {
  getConvocation, listMatches, listPlays, listResults, listTrainings, saveConvocation,
  saveMatch, savePlay, saveResult, saveTeam, saveTraining,
} from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const evt = (id: string): GameEvent => ({ id, type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })

const rencontre = (id: string, champ: string, date: string, events: GameEvent[] = []): Match => ({
  id, meta: { championshipLabel: champ, date, clubId: 'ta', opponentId: 'tb' },
  roster: [], events, status: events.length ? 'finished' : 'setup',
})

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await db.teams.clear(); await db.players.clear(); await db.matches.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear(); await db.outbox.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveMatch(rencontre('m1', 'Poule A', '2026-01-10', [evt('e1')]))
  await saveMatch(rencontre('m2', 'Poule A', '2026-01-17'))
  await saveMatch(rencontre('m3', 'Poule B', '2025-11-08', [evt('e2')]))
  await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
  await saveConvocation({ matchId: 'm3', playerIds: ['p1'] })
  await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'ta', homeScore: 70, awayScore: 60 })
  await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
  await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'PnR haut' })
  localStorage.setItem('swish-club-id', 'ta')
})

const renderAdmin = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><Admin /></AuthProvider></ClubProvider></MemoryRouter>)

/** La ligne d'une opération, repérée par son bouton : c'est là que s'affiche le
 *  compte de ce qu'elle détruira. */
const ligne = (aria: string) => screen.getByRole('button', { name: aria }).closest('li') as HTMLElement

const confirmer = async () => userEvent.click(await screen.findByRole('button', { name: /supprimer définitivement/i }))

describe('Administration — the counts announced', () => {
  it('shows the real count of what each operation would destroy', async () => {
    renderAdmin()
    await screen.findByRole('button', { name: 'Supprimer les rencontres de Poule A' })

    expect(ligne('Supprimer les rencontres de Poule A')).toHaveTextContent('2 rencontres')
    expect(ligne('Supprimer les rencontres de Poule B')).toHaveTextContent('1 rencontre')
    expect(ligne('Supprimer les rencontres de l’année 2026')).toHaveTextContent('2 rencontres')
    expect(ligne('Supprimer les rencontres de l’année 2025')).toHaveTextContent('1 rencontre')
    // Deux rencontres portent des évènements, la troisième est encore vierge.
    expect(ligne('Vider les feuilles de VIGNOT')).toHaveTextContent('2 feuilles à vider')
    expect(ligne('Supprimer les résultats saisis')).toHaveTextContent('1 résultat')
    expect(ligne('Supprimer les entraînements')).toHaveTextContent('1 séance')
    expect(ligne('Supprimer les schémas')).toHaveTextContent('1 schéma')
  })

  it('says in the confirmation what will be destroyed, and how much', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer les rencontres de Poule A' }))
    expect(await screen.findByText(/Les 2 rencontres de « Poule A », leurs feuilles et leurs convocations/)).toBeInTheDocument()
  })

  it('disables an operation that would destroy nothing, showing its count at zero', async () => {
    await db.results.clear(); await db.plays.clear()
    renderAdmin()
    await waitFor(() => expect(ligne('Supprimer les résultats saisis')).toHaveTextContent('0 résultat'))
    expect(screen.getByRole('button', { name: 'Supprimer les résultats saisis' })).toBeDisabled()
    expect(ligne('Supprimer les schémas')).toHaveTextContent('0 schéma')
    expect(screen.getByRole('button', { name: 'Supprimer les schémas' })).toBeDisabled()
  })

  it('announces the grouping by calendar year, for want of a sporting season in the data', async () => {
    renderAdmin()
    expect(await screen.findByText(/ne connaît pas la saison sportive/i)).toBeInTheDocument()
    expect(screen.getByText(/Le regroupement se fait par année civile/i)).toBeInTheDocument()
  })
})

describe('Administration — scopes', () => {
  it('deletes the games of the targeted league alone, with their call-ups', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer les rencontres de Poule A' }))
    await confirmer()

    await waitFor(async () => expect((await listMatches()).map((m) => m.id)).toEqual(['m3']))
    expect(await getConvocation('m1')).toBeUndefined()
    expect(await getConvocation('m3')).toBeDefined()
  })

  it('deletes the games of the targeted year alone', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer les rencontres de l’année 2025' }))
    await confirmer()

    await waitFor(async () => expect((await listMatches()).map((m) => m.id).sort()).toEqual(['m1', 'm2']))
  })

  it('empties a team\'s sheets without deleting its games', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Vider les feuilles de VIGNOT' }))
    await confirmer()

    await waitFor(async () => expect((await listMatches()).every((m) => m.events.length === 0)).toBe(true))
    const restantes = await listMatches()
    expect(restantes.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3'])
    expect(restantes.find((m) => m.id === 'm1')?.meta.date).toBe('2026-01-10')
    // Vider n'est pas supprimer : les convocations restent attachées à leur rencontre.
    expect(await getConvocation('m1')).toBeDefined()
  })

  it('deletes the entered results in bulk, without touching the games', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer les résultats saisis' }))
    await confirmer()

    await waitFor(async () => expect(await listResults()).toEqual([]))
    expect(await listMatches()).toHaveLength(3)
  })

  it('deletes the club\'s trainings and plays in bulk', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer les entraînements' }))
    await confirmer()
    await waitFor(async () => expect(await listTrainings()).toEqual([]))

    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer les schémas' }))
    await confirmer()
    await waitFor(async () => expect(await listPlays('ta')).toEqual([]))
  })
})

describe('Administration — erase everything', () => {
  it('refuses the reset until the club\'s name is typed exactly', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Tout effacer' }))
    const valider = await screen.findByRole('button', { name: /supprimer définitivement/i })

    expect(valider).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Saisissez « VIGNOT »/), 'VIGNO')
    expect(valider).toBeDisabled()
    await userEvent.click(valider)
    expect(await listMatches()).toHaveLength(3)

    await userEvent.type(screen.getByLabelText(/Saisissez « VIGNOT »/), 'T')
    expect(valider).toBeEnabled()
  })

  it('empties every table once the club\'s name is typed', async () => {
    renderAdmin()
    await userEvent.click(await screen.findByRole('button', { name: 'Tout effacer' }))
    await userEvent.type(await screen.findByLabelText(/Saisissez « VIGNOT »/), 'VIGNOT')
    await confirmer()

    await waitFor(async () => expect(await listMatches()).toEqual([]))
    expect(await db.teams.count()).toBe(0)
    expect(await listResults()).toEqual([])
    expect(await listTrainings()).toEqual([])
    expect(await db.convocations.count()).toBe(0)
  })
})

describe('Administration — rights', () => {
  it('shows the scorer\'s table no operation, and touches nothing', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderAdmin()

    // L'écran n'est qu'une planche de boutons destructeurs : sans le droit, il ne
    // se monte pas du tout plutôt que d'aligner des boutons qui réclament un code.
    const opérations = [
      'Supprimer les rencontres de Poule A',
      'Supprimer les rencontres de l’année 2026',
      'Vider les feuilles de VIGNOT',
      'Supprimer les résultats saisis',
      'Supprimer les entraînements',
      'Supprimer les schémas',
      'Tout effacer',
    ]
    for (const name of opérations) {
      expect(screen.queryByRole('button', { name: name })).not.toBeInTheDocument()
    }
    // Et aucune confirmation ne peut s'ouvrir derrière.
    expect(screen.queryByRole('button', { name: /supprimer définitivement/i })).not.toBeInTheDocument()

    // Ce qui compte : rien n'a été effacé en base.
    expect(await listMatches()).toHaveLength(3)
    expect((await listMatches()).flatMap((m) => m.events)).toHaveLength(2)
    expect(await listResults()).toHaveLength(1)
    expect(await listTrainings()).toHaveLength(1)
    expect(await listPlays('ta')).toHaveLength(1)
    expect(await db.teams.count()).toBe(2)
  })
})
