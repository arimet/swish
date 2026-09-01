import { act, fireEvent, render, screen, waitFor, within } from '../../test/render'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Dashboard, LIVE_SEEN_KEY } from './Dashboard'
import { AuthProvider, PLAYER_ID_KEY, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { count } from '../../test/fakeApi'
import { getMessage, saveConvocation, saveMatch, saveMessage, savePlay, savePlayer, saveTeam, saveTraining } from '../../persistence/repositories'
import { newPlay, type Play } from '../../domain/plays'
import type { GameEvent, Match } from '../../domain/types'

const play = (id: string, name: string): Play => ({ id, ...newPlay('ta', 'half', false), name })

const TOP3 = { x: 0.5, y: 0.65 }

// The hard-coded dates ('2026-01-10' and friends) serve the tests that never look at
// "today" (record, hot zone): `nextFixture` does compare against the
// real clock at the moment the test runs, so the fixtures we want kept must be
// computed relative to it, not to a fixed date that would eventually fall into the
// past.
const inNDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

const finished = (id: string, pa: number, pb: number, events: Partial<GameEvent>[] = []): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
  roster: ['p1'], status: 'finished',
  events: [
    { type: 'CLOCK_START' as const },
    ...Array.from({ length: pa }, () => ({ type: 'SCORE' as const, team: 'A' as const, playerId: 'p1', kind: '2int' as const })),
    ...Array.from({ length: pb }, () => ({ type: 'SCORE' as const, team: 'B' as const, kind: '2int' as const })),
    ...events,
  ].map(ev),
})

const renderDash = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><Dashboard /></AuthProvider></ClubProvider></MemoryRouter>)

beforeEach(async () => {
  localStorage.clear()
  // The role lives in the tab's session: without this cleanup, a test that unlocks
  // administration would leave the following ones already unlocked.
  sessionStorage.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Dashboard', () => {
  it('shows the club\'s record', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText('VIGNOT')).toBeInTheDocument()
    expect(await screen.findByText('1V – 0D')).toBeInTheDocument()
  })

  it('puts the live game at the top', async () => {
    // The shortcut to the scorer's table is reserved for whoever keeps it: this test
    // stands on their side, the visitor's case is checked just below.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
  })

  it('sends a visitor to follow the game rather than leaving them on the dashboard', async () => {
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    render(
      <MemoryRouter>
        <ClubProvider><AuthProvider>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="/match/:id/watch" element={<p>suivi du match</p>} />
          </Routes>
        </AuthProvider></ClubProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('suivi du match')).toBeInTheDocument()
  })

  it('a visitor already sent once reads the live score without being offered the scorer\'s table', async () => {
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    // Coming back to the dashboard from the follow-along view: the tab has had its
    // one redirection, so the banner is what is left to read.
    sessionStorage.setItem(LIVE_SEEN_KEY, 'm2')
    renderDash()
    // The live banner stays whole — the state, the opposition, the score: exactly
    // what a player or a parent comes to look at.
    expect(await screen.findByText(/en direct/i)).toBeInTheDocument()
    expect(screen.getByText(/contre VERDUN/i)).toBeInTheDocument()
    // Six paniers à deux points contre quatre : le bandeau affiche bien 12 – 8.
    expect(screen.getByText(/12/, { selector: '.nums' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /table de marque/i })).not.toBeInTheDocument()
  })

  it('announces the next game when none is in progress', async () => {
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup', meta: { championshipLabel: 'Poule A', date: inNDays(5), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByText(/prochaine rencontre/i)).toBeInTheDocument()
  })

  it('does not announce in the banner a game planned and never played, when the fixture block already excludes it', async () => {
    // Status left at `setup` but the date is past: a game planned and then never
    // played. The banner must apply the same rule as `nextFixture` (which excludes
    // the past), otherwise it would announce "Next game" next to a contradictory
    // "Nothing planned yet" block.
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup', meta: { championshipLabel: 'Poule A', date: '2020-01-10', clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
    expect(screen.queryByText(/prochaine rencontre/i)).not.toBeInTheDocument()
  })

  it('does not show an empty hot zone with no explanation', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/aucun tir localisé/i)).toBeInTheDocument()
  })

  it('shows the club\'s hot zone as soon as one shot is located', async () => {
    await saveMatch(finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]))
    renderDash()
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })

  it('announces no game played for a club that is no game\'s clubId', async () => {
    // 'tb' only appears as m1's `opponentId`: it is never "our" game.
    await saveMatch(finished('m1', 10, 4))
    localStorage.setItem('swish-club-id', 'tb')
    renderDash()
    expect(await screen.findByText('Aucune rencontre jouée')).toBeInTheDocument()
  })

  it('shows the number called up and the meeting point of the next fixture called up', async () => {
    await saveMatch({ ...finished('m4', 0, 0), id: 'm4', status: 'setup', meta: { championshipLabel: 'Poule A', date: inNDays(5), clubId: 'ta', opponentId: 'tb' } })
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00', meetPlace: 'Gymnase Colette' })
    renderDash()
    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    expect(await screen.findByText(/18:00/)).toBeInTheDocument()
    expect(await screen.findByText(/gymnase colette/i)).toBeInTheDocument()
    expect(await screen.findByText(/MARTIN Lucas/)).toBeInTheDocument()
  })

  it('invites planning when no fixture is scheduled', async () => {
    // One game played, and that premise carries the test: "no fixture scheduled"
    // describes a club **in season** with nothing ahead of it. A club with no game at
    // all is another state — getting started — and that is the next test.
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })

  /**
   * The founder's arrival, right after entering their roster.
   *
   * The screen a founder must **not** meet: four statistic tiles reading "—", a form
   * strip reading "—", two panels announcing the absence of scorers and shots, and two
   * invitations to plan a game that do not say an opposition has to be recorded first,
   * so both lead to a dead end. Six blocks saying six times that nothing has begun,
   * and not one usable path.
   */
  it('a club with no game at all gets the getting-started block, not the empty figures', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderDash()

    expect(await screen.findByText(/pour commencer|votre effectif est prêt/i)).toBeInTheDocument()
    // The current step is the roster: a single player in the fixture, and you do not
    // field a five with that. It really is the state of the data that decides, not a
    // remembered counter — the opposition "VERDUN" already exists, so its step is
    // done.
    expect(await screen.findByRole('link', { name: /compléter l.effectif/i })).toBeInTheDocument()
    // One action at a time: offering all three would let someone pick an order that
    // does not work — planning a game before having an opposition leads to the dead end
    // of `/match/new`.
    expect(screen.queryByRole('link', { name: /nouvelle rencontre/i })).not.toBeInTheDocument()
    // And nothing of the season's figures, nor the two redundant invitations.
    expect(screen.queryByText(/rien de planifié/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/points encaissés/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pas encore de points marqués/i)).not.toBeInTheDocument()
  })

  it('does not announce the same game twice when it is already live', async () => {
    // The live game carries today's date (hence "upcoming" for `nextFixture` if it
    // were not explicitly excluded): without the exclusion this test would discriminate
    // nothing, since `nextFixture` ignores a past date like '2026-01-10' anyway.
    // No fixture other than the live game: the block must invite planning rather than
    // repeat the opposition already shown in the banner.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: inNDays(0), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })

  it('excludes every live game from the next fixture, not only the first', async () => {
    // Nothing prevents a second `live` game while the first is unfinished (started by
    // mistake): both must stay out of the upcoming fixtures, otherwise the second would
    // be announced as the "next fixture" although it
    // a déjà commencé.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: inNDays(0), clubId: 'ta', opponentId: 'tb' } })
    await saveMatch({ ...finished('m5', 2, 1), id: 'm5', status: 'live', meta: { championshipLabel: 'Poule A', date: inNDays(1), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })
})

describe('Dashboard — the next session\'s plays', () => {
  // `queryAll` and not `getAll`: without the write right, a dashboard with no upcoming
  // game has no link left at all — "+ Plan" is reserved for whoever manages the club —
  // and `getAllByRole` would throw instead of returning an empty list.
  const viewerLinks = () => screen.queryAllByRole('link').filter((l) => l.getAttribute('href')?.endsWith('/lecteur'))

  it('leads to the viewer of every play scheduled for the next session', async () => {
    // The shortest path between "it is Tuesday" and "here is what we are working on".
    await savePlay(play('s1', 'Pick and roll haut'))
    await savePlay(play('s2', 'Corner pour le 4'))
    await saveTraining({ id: 't1', clubId: 'ta', date: inNDays(2), theme: 'Systèmes', playIds: ['s1', 's2'] })
    renderDash()

    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /pick and roll haut/i })).toHaveAttribute('href', '/schemas/s1/lecteur')
    expect(screen.getByRole('link', { name: /corner pour le 4/i })).toHaveAttribute('href', '/schemas/s2/lecteur')
  })

  it('ignores a deleted play the session still cites', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: inNDays(2), theme: 'Systèmes', playIds: ['disparu', 's1'] })
    renderDash()

    expect(await screen.findByRole('link', { name: /pick and roll haut/i })).toBeInTheDocument()
    // An orphan id must neither break the screen nor open an empty viewer.
    expect(viewerLinks()).toHaveLength(1)
  })

  it('announces no play when the session carries none', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: inNDays(2), theme: 'Systèmes' })
    renderDash()

    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(viewerLinks()).toHaveLength(0)
  })
})

describe('the player\'s identity', () => {
  it('highlights the identified player\'s row and offers a shortcut to their record', async () => {
    localStorage.setItem(PLAYER_ID_KEY, 'p1')
    await savePlayer({ id: 'p2', teamId: 'ta', number: 9, lastName: 'DURAND', firstName: 'Théo' })
    await saveMatch({ ...finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p2', kind: '2int' }]), roster: ['p1', 'p2'] })
    renderDash()

    const scorers = (await screen.findByText('Meilleurs marqueurs')).closest('section')!
    const row = within(scorers).getByText('MARTIN Lucas').closest('a')!
    expect(within(row).getByText('vous')).toBeInTheDocument()
    // The team-mate appears in the same list without inheriting the mark.
    const autre = within(scorers).getByText('DURAND Théo').closest('a')!
    expect(within(autre).queryByText('vous')).not.toBeInTheDocument()

    expect(await screen.findByRole('link', { name: /ma fiche/i })).toBeInTheDocument()
  })

  it('ignores an id matching no player in the roster', async () => {
    // A player removed from the roster, their id surviving in localStorage: no ghost
    // highlight, no shortcut to a record that no longer exists.
    localStorage.setItem(PLAYER_ID_KEY, 'parti')
    await saveMatch(finished('m1', 10, 4))
    renderDash()

    const scorers = (await screen.findByText('Meilleurs marqueurs')).closest('section')!
    expect(within(scorers).getByText('MARTIN Lucas')).toBeInTheDocument()
    expect(within(scorers).queryByText('vous')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ma fiche/i })).not.toBeInTheDocument()
  })
})

// ── The team message ────────────────────────────────────────────────────────
// The coach's only channel to their team: a short text, one at a time, read by
// everyone on opening the application, written and erased by the
// administrateur.

describe('Dashboard — the message to the team', () => {
  const openEntry = async () => userEvent.click(await screen.findByRole('button', { name: /message à l’équipe/i }))

  it('shows the message written, with its age', async () => {
    const avantHier = new Date(Date.now() - 2 * 86400_000).toISOString()
    await saveMessage({ clubId: 'ta', text: 'Pas d’entraînement mardi, gymnase fermé.', writtenAt: avantHier })
    renderDash()

    expect(await screen.findByText(/gymnase fermé/)).toBeInTheDocument()
    expect(await screen.findByText(/il y a 2 jours/i)).toBeInTheDocument()
  })

  it('does not occupy the dashboard when there is no message', async () => {
    renderDash()
    await screen.findByText('VIGNOT')
    expect(screen.queryByTestId('team-message')).not.toBeInTheDocument()
  })

  it('does not occupy the dashboard for an empty message: whitespace is not a message', async () => {
    await saveMessage({ clubId: 'ta', text: '   ', writtenAt: new Date().toISOString() })
    renderDash()
    await screen.findByText('VIGNOT')
    // We let the message read settle before concluding it is absent: without this
    // wait, the test would pass just as well without the guard as with it, never having
    // let the blank message reach the render.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByTestId('team-message')).not.toBeInTheDocument()
  })

  it('a visitor reads it without being asked for any code', async () => {
    // It is a message for the team, players included: reading is ungated.
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: new Date().toISOString() })
    renderDash()

    expect(await screen.findByText('Maillot blanc samedi.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })

  it('shows the form only after a click, and writing makes the message visible', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderDash()
    await screen.findByText('VIGNOT')
    expect(screen.queryByLabelText(/message à l’équipe/i)).not.toBeInTheDocument()

    await openEntry()
    await userEvent.type(await screen.findByLabelText(/message à l’équipe/i), 'Gymnase fermé mardi.')
    await userEvent.click(screen.getByRole('button', { name: /publier/i }))

    // `guard()` fires the action without awaiting it: after the click, the write to
    // the store and then the re-render are asynchronous. We wait for the store first —
    // under the full suite's load, the default second is not always enough for it —
    // then the screen, which can only follow.
    await waitFor(async () => expect((await getMessage('ta'))?.text).toBe('Gymnase fermé mardi.'), { timeout: 5000 })
    expect(await screen.findByText('Gymnase fermé mardi.', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('writing a second replaces the first', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    await saveMessage({ clubId: 'ta', text: 'Ancien message.', writtenAt: new Date(Date.now() - 3 * 86400_000).toISOString() })
    renderDash()

    // We wait for the old message to be displayed before opening the form: the load
    // is asynchronous, and opening before it resolves let its resolution overwrite the
    // freshly published text — hence the flakiness.
    await screen.findByText('Ancien message.')
    await userEvent.click(await screen.findByRole('button', { name: /modifier/i }))
    const champ = await screen.findByLabelText(/message à l’équipe/i)
    // One event rather than sixteen keystrokes: it is exactly what the controlled
    // field listens for, and typing character by character made this test flaky under
    // the full suite's load — it failed one time in three.
    fireEvent.change(champ, { target: { value: 'Nouveau message.' } })
    // "Publish" stays dark while the text is empty: clicking before React had
    // committed the input did nothing, and the test failed without proving anything.
    await waitFor(() => expect(champ).toHaveValue('Nouveau message.'))
    await userEvent.click(screen.getByRole('button', { name: /publier/i }))

    // The store first — it is authoritative — then the screen. An assertion on the
    // screen alone failed one time in seven under the full suite's load, with no cause
    // established. Waiting for both rather than assuming the order checks the same
    // thing without depending on timing.
    await waitFor(async () => expect((await getMessage('ta'))?.text).toBe('Nouveau message.'))
    await waitFor(() => expect(screen.getByText('Nouveau message.')).toBeInTheDocument())
    expect(screen.queryByText('Ancien message.')).not.toBeInTheDocument()
    // One message at a time: this is not a thread, there is nothing to stack.
    expect(count('message')).toBe(1)
  })

  it('erasing it makes the panel disappear', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: new Date().toISOString() })
    renderDash()

    await userEvent.click(await screen.findByRole('button', { name: /effacer/i }))

    await waitFor(() => expect(screen.queryByTestId('team-message')).not.toBeInTheDocument())
    expect(await getMessage('ta')).toBeUndefined()
  })

  it('writing is administrative: the scorer\'s table does not see the button, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderDash()
    await screen.findByText('VIGNOT')

    // The button does not exist for it: no more code prompt on clicking an action it
    // has no right to carry out.
    expect(screen.queryByRole('button', { name: /message à l’équipe/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/message à l’équipe/i)).not.toBeInTheDocument()
    // What matters stays true: nothing is written to the store.
    expect(await getMessage('ta')).toBeUndefined()
  })

  it('erasing is administrative: the scorer\'s table does not see the button, and the message stays', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: new Date().toISOString() })
    renderDash()

    // It reads the message — it is one for the whole team — but neither "Edit" nor
    // "Erase" is offered to it.
    expect(await screen.findByText('Maillot blanc samedi.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument()
    expect(await getMessage('ta')).toBeDefined()
  })
})

describe('Dashboard — reaching the call-up', () => {
  const rencontreAVenir = async () =>
    saveMatch({ ...finished('m4', 0, 0), id: 'm4', status: 'setup', meta: { championshipLabel: 'Poule A', date: inNDays(5), clubId: 'ta', opponentId: 'tb' } })

  // Calling up writes: the shortcut is the coach's, so these tests stand on their
  // side. Showing who is called up is checked without the right further down.
  beforeEach(() => sessionStorage.setItem(ROLE_KEY, 'admin'))

  it('leads to the next game\'s call-up from the "next fixture" block', async () => {
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00' })
    renderDash()

    expect(await screen.findByRole('link', { name: /convocation/i })).toHaveAttribute('href', '/match/m4#convocation')
  })

  it('a visitor reads who is called up without being offered to call anyone up', async () => {
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00' })
    sessionStorage.removeItem(ROLE_KEY)
    renderDash()

    // What a player comes for — am I called up, at what time — stays there.
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    expect(screen.getByText(/rendez-vous 18:00/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /convocation|convoquer/i })).not.toBeInTheDocument()
  })

  it('says plainly that nobody is called up, and offers to call up', async () => {
    // This is precisely the moment when action is wanted: "call-up to prepare" did not
    // stand out enough from a plain label, and led nowhere.
    await rencontreAVenir()
    renderDash()

    expect(await screen.findByText(/personne n’est convoqué/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /convoquer/i })).toHaveAttribute('href', '/match/m4#convocation')
  })

  it('treats a saved call-up with no player as nobody being called up', async () => {
    // A call-up emptied of its players (or whose roster has been deleted) is a record
    // with nobody called up: the screen must say so, not show "0".
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: [] })
    renderDash()

    expect(await screen.findByText(/personne n’est convoqué/i)).toBeInTheDocument()
  })
})
