import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamDetail } from './TeamDetail'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { getTeam, listPlayers, saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
})

const renderTeam = () =>
  render(
    <MemoryRouter initialEntries={['/teams/ta']}>
      <ClubProvider>
        <AuthProvider>
          <Routes><Route path="/teams/:id" element={<TeamDetail />} /></Routes>
        </AuthProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

describe('TeamDetail — the player details', () => {
  it('fills in the birth date without changing the player\'s id', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    // The edit block's label differs from the add form's ("Date de naissance"): both
    // coexist on screen, so each must stay unambiguously reachable by its own
    // accessible name.
    await userEvent.type(screen.getByLabelText(/^naissance$/i), '2000-06-15')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    await waitFor(async () => {
      const [p] = await listPlayers('ta')
      // The id must survive: it carries the player's whole shot history.
      expect(p.id).toBe('p1')
      expect(p.birthDate).toBe('2000-06-15')
    })
  })

  it('fills in the height', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.type(screen.getByLabelText(/taille du joueur/i), '192')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(async () => expect((await listPlayers('ta'))[0].height).toBe(192))
  })

  it('clears a birth date and a height already filled in', async () => {
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas', birthDate: '2000-06-15', height: 190 })
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.clear(screen.getByLabelText(/^naissance$/i))
    await userEvent.clear(screen.getByLabelText(/taille du joueur/i))
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    await waitFor(async () => {
      const [p] = await listPlayers('ta')
      // A cleared field goes back to `undefined`, never '' nor 0 nor NaN.
      expect(p.birthDate).toBeUndefined()
      expect(p.height).toBeUndefined()
    })
  })

  it('adds a player with their birth date and height', async () => {
    renderTeam()
    // The form is folded away: it appears on a click, never up front.
    await userEvent.click(await screen.findByRole('button', { name: /ajouter un joueur/i }))
    await userEvent.type(await screen.findByPlaceholderText('N°'), '9')
    await userEvent.type(screen.getByPlaceholderText('Nom'), 'DUPONT')
    await userEvent.type(screen.getByLabelText(/date de naissance/i), '1998-03-02')
    await userEvent.type(screen.getByLabelText(/taille/i), '201')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le joueur/i }))

    await waitFor(async () => {
      const added = (await listPlayers('ta')).find((p) => p.lastName === 'DUPONT')
      expect(added?.birthDate).toBe('1998-03-02')
      expect(added?.height).toBe(201)
    })
  })
})

describe('TeamDetail — rights', () => {
  it('editing the roster is administrative: the scorer\'s table sees none of its buttons, and nothing is written', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderTeam()
    await screen.findByText(/MARTIN/)

    // It reads the whole record — record, scorers, roster — with no write action
    // offered to it, hence no code prompt on a click.
    expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modifier MARTIN/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('N°')).not.toBeInTheDocument()
    // What matters: the roster has not moved.
    expect(await listPlayers('ta')).toHaveLength(1) // MARTIN alone, DUPONT was not added
  })

  it('removes a player only after confirmation', async () => {
    // This path was not covered, and that is why the defect held: "remove" deleted the
    // player on a single click, from a twenty-four-pixel button flush against "edit",
    // while deleting the team just above asked for confirmation. No test broke when the
    // dialog was added — proof that there was nothing here to say so.
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /retirer MARTIN/i }))

    expect(await screen.findByText(/retirer MARTIN Lucas/i)).toBeInTheDocument()
    expect(await listPlayers('ta')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /^retirer$/i }))
    // `guard()` fires the action without awaiting it: the store empties after the
    // click.
    await waitFor(async () => expect(await listPlayers('ta')).toHaveLength(0))
  })

  it('shows the add form only after a click', async () => {
    renderTeam()
    await screen.findByRole('button', { name: /ajouter un joueur/i })
    expect(screen.queryByPlaceholderText('N°')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ajouter un joueur/i }))
    expect(await screen.findByPlaceholderText('N°')).toBeInTheDocument()
  })

  it('does not let anyone type a coach the right will not let them save', async () => {
    // The same requirement as on the standings' score field: what the screen shows and
    // what the store holds must say the same thing. The field therefore does not show
    // at all without the right, rather than opening to typing only to be refused on
    // submit.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderTeam()
    await screen.findByText(/MARTIN/)

    expect(screen.queryByLabelText(/entraîneur/i)).not.toBeInTheDocument()
    expect((await getTeam('ta'))?.coach).toBeUndefined()
  })
})

describe('TeamDetail — top scorers', () => {
  /** A game played where MARTIN scores: with no points, the panel stays empty. */
  const matchWithPoints = async () => {
    await saveMatch({
      id: 'm1',
      meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
      roster: ['p1'],
      status: 'finished',
      events: [
        { id: 'e0', wallClock: 0, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'], period: 1, gameClock: 600 },
        { id: 'e1', wallClock: 1, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 1, gameClock: 500 },
      ],
    } as Parameters<typeof saveMatch>[0])
  }

  it('every scorer leads to their record', async () => {
    // The same ranking is clickable on the dashboard; it was inert here, forcing
    // people to find the name again in the roster of eleven just above.
    //
    // The query is **scoped to the panel** and not to the page: the roster just above
    // already holds a link to the same record, so that a global `getByRole('link')`
    // passed even when the ranking's row was not a link at all. A test that cannot fail
    // proves nothing.
    await matchWithPoints()
    renderTeam()
    const titre = await screen.findByRole('heading', { name: 'Meilleurs marqueurs' })
    const panneau = titre.closest('section')!
    // `findByRole` and not `getByRole`: the panel renders its **title** on the first
    // pass, including in its empty state, while its rows wait on an asynchronous read
    // from the store. Waiting for the title therefore did not wait for the rows, and
    // this test failed about one time in eight — on the empty state, never on a real
    // defect.
    const lien = await within(panneau).findByRole('link', { name: /MARTIN/ })
    expect(lien).toHaveAttribute('href', '/players/p1')
    // Looking for the link *inside* the panel is enough to prove it is not empty: with
    // no point scored, it would render its empty state and the query would fail.
  })
})
