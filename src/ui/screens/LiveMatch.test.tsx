import { fireEvent, render, screen, waitFor, within } from '../../test/render'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveMatch } from './LiveMatch'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { getMatch, saveSheet, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'match-1'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { clubId: 'ta', opponentId: 'tb' },
    roster: ['p1'],
    status: 'live',
    events: [
      { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { id: 'e1', wallClock: 1, period: 1, gameClock: 600, type: 'CLOCK_START' },
    ],
  }
  await saveSheet(null, m)
})

afterEach(() => { vi.restoreAllMocks() })

const renderLive = () =>
  render(<AuthProvider><MemoryRouter><LiveMatch matchId={MATCH_ID} onFinish={vi.fn()} /></MemoryRouter></AuthProvider>)

describe('LiveMatch', () => {
  it('shows a single team column', async () => {
    renderLive()
    expect(await screen.findByText('MARTIN')).toBeInTheDocument()
    expect(screen.queryByText('VISITEURS')).not.toBeInTheDocument()
  })

  it('adds an opposition basket with no player named', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 3 points à VERDUN' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      const opp = saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')
      expect(opp).toHaveLength(1)
      expect(opp[0]).toMatchObject({ kind: '3' })
      expect((opp[0] as { playerId?: string }).playerId).toBeUndefined()
    })
  })

  it('deletes any entry from the history, the opposition\'s basket included, and the score follows', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter 3 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    const history = await screen.findByRole('dialog')
    // The latest on top: the three, then the two.
    const rows = within(history).getAllByRole('checkbox')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Panier (+3)'), expect.stringContaining('Panier (+2)')])
    await userEvent.click(rows[1])
    await userEvent.click(within(history).getByRole('button', { name: 'Supprimer' }))
    // Asked once, on the row: nothing leaves before the yes.
    expect((await getMatch(MATCH_ID))!.events.filter((e) => e.type === 'SCORE')).toHaveLength(2)
    await userEvent.click(within(history).getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(async () => {
      const opp = (await getMatch(MATCH_ID))!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')
      expect(opp.map((e) => e.type === 'SCORE' && e.kind)).toEqual(['3'])
    })
  })

  it('the player dialog undoes that player\'s last entry, and only theirs', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: /MARTIN/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Faute défensive' }))
    await userEvent.click(screen.getByRole('button', { name: /MARTIN/ }))
    await userEvent.click(await screen.findByRole('checkbox', { name: /Faute défensive/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler l’action cochée' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, annuler' }))
    await waitFor(async () => {
      const events = (await getMatch(MATCH_ID))!.events
      expect(events.some((e) => e.type === 'FOUL')).toBe(false)
      // The opposition's basket, entered after nothing of MARTIN's, stays.
      expect(events.some((e) => e.type === 'SCORE' && e.team === 'B')).toBe(true)
    })
  })

  it('asks before moving on to the next period, and says what it resets', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Période →' }))
    const confirm = await screen.findByRole('dialog')
    expect(confirm).toHaveTextContent('Passer à la période 2 ?')
    expect(confirm).toHaveTextContent('Le chrono sera remis à 10:00')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }))
    expect((await getMatch(MATCH_ID))!.events.some((e) => e.type === 'PERIOD_END')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Période →' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Période →' }))
    await waitFor(async () => {
      const events = (await getMatch(MATCH_ID))!.events
      expect(events.filter((e) => e.type === 'PERIOD_START').map((e) => e.period)).toEqual([2])
    })
  })

  it('deletes several ticked entries in one go', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter 3 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter 1 point à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    const history = await screen.findByRole('dialog')
    const rows = within(history).getAllByRole('checkbox')
    await userEvent.click(rows[0])
    await userEvent.click(rows[2])
    // Modifying takes one entry at a time: with two ticked, only deleting is offered.
    expect(within(history).queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    await userEvent.click(within(history).getByRole('button', { name: 'Supprimer les 2' }))
    expect(history).toHaveTextContent('Supprimer ces 2 actions ?')
    await userEvent.click(within(history).getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(async () => {
      const opp = (await getMatch(MATCH_ID))!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')
      expect(opp.map((e) => e.type === 'SCORE' && e.kind)).toEqual(['3'])
    })
  })

  it('puts a timeout right — its team and its clock — where it stood', async () => {
    const m = (await getMatch(MATCH_ID))!
    await saveSheet(m, { ...m, events: [...m.events,
      { id: 't1', wallClock: 2, period: 1, gameClock: 300, type: 'TIMEOUT', team: 'A' },
      { id: 'x1', wallClock: 3, period: 1, gameClock: 200, type: 'SCORE', team: 'B', kind: '2int' },
    ] })
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    const history = await screen.findByRole('dialog')
    // Straight from the row's pencil: no ticking first to find the button.
    await userEvent.click(within(history).getByRole('button', { name: 'Modifier : Temps mort' }))
    await userEvent.click(within(history).getByRole('radio', { name: 'VERDUN' }))
    const clock = within(history).getByRole('textbox', { name: 'Chrono' })
    await userEvent.clear(clock)
    await userEvent.type(clock, '04:30')
    await userEvent.click(within(history).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(async () => {
      const events = (await getMatch(MATCH_ID))!.events
      const at = events.findIndex((e) => e.type === 'TIMEOUT')
      expect(events[at]).toMatchObject({ team: 'B', period: 1, gameClock: 270 })
      expect(events.some((e) => e.id === 't1')).toBe(false)
      expect(events[at + 1].id).toBe('x1')
    })
  })

  it('modifies a player\'s action: another player, another action, same place, same clock', async () => {
    await savePlayer({ id: 'p2', teamId: 'ta', number: 7, lastName: 'DURAND', firstName: 'Théo' })
    const m = (await getMatch(MATCH_ID))!
    await saveSheet(m, {
      ...m, roster: ['p1', 'p2'],
      events: [
        ...m.events,
        { id: 'f1', wallClock: 2, period: 1, gameClock: 480, type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' },
        { id: 't1', wallClock: 3, period: 1, gameClock: 300, type: 'TIMEOUT', team: 'A' },
      ],
    })
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    const history = await screen.findByRole('dialog')
    await userEvent.click(within(history).getByRole('checkbox', { name: /Faute/ }))
    await userEvent.click(within(history).getByRole('button', { name: 'Modifier' }))
    // Preselected on the current player; DURAND takes it.
    expect(within(history).getByRole('radio', { name: /MARTIN/ })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(history).getByRole('radio', { name: /DURAND/ }))
    await userEvent.click(within(history).getByRole('button', { name: 'Continuer' }))
    // DURAND's dialog: the entry is a block now, not a foul.
    await screen.findByText('Modifier · 7 DURAND')
    await userEvent.click(screen.getByRole('button', { name: /Contre/ }))
    await waitFor(async () => {
      const events = (await getMatch(MATCH_ID))!.events
      expect(events.some((e) => e.id === 'f1')).toBe(false)
      const at = events.findIndex((e) => e.type === 'STAT')
      expect(events[at]).toMatchObject({ playerId: 'p2', stat: 'block', period: 1, gameClock: 480 })
      // Where the foul stood: before the timeout, not after it.
      expect(events[at + 1].id).toBe('t1')
    })
  })

  it('files a trip to the line as one basket and one miss, in the order shot', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: /MARTIN/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Lancer franc' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'LF 1' })).getByRole('button', { name: 'Manqué' }))
    await userEvent.click(screen.getByRole('button', { name: 'Valider les lancers francs' }))
    await waitFor(async () => {
      const shots = (await getMatch(MATCH_ID))!.events.filter((e) => e.type === 'SCORE' || e.type === 'MISS')
      expect(shots.map((e) => [e.type, 'kind' in e && e.kind])).toEqual([['MISS', 'lf'], ['SCORE', 'lf']])
    })
  })

  it('files an and-one as the basket, the opposition\'s foul and the free throw', async () => {
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: /MARTIN/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points' }))
    await userEvent.click(screen.getByRole('button', { name: 'And one' }))
    await userEvent.click(screen.getByRole('button', { name: 'Valider les lancers francs' }))
    await waitFor(async () => {
      const saved = (await getMatch(MATCH_ID))!
      const ours = saved.events.filter((e) => e.type === 'SCORE' && e.team === 'A')
      expect(ours.map((e) => e.type === 'SCORE' && e.kind)).toEqual(['2int', 'lf'])
      expect(saved.events.filter((e) => e.type === 'FOUL')).toEqual([expect.objectContaining({ team: 'B', target: { kind: 'team' } })])
    })
    // Their team fouls show, one of them, next to ours.
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    expect(await screen.findByRole('status', { name: 'Fautes d’équipe VERDUN : 1' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Fautes d’équipe VIGNOT : 0' })).toBeInTheDocument()
  })
})

// The screen's full wiring, on our team's side: the scorer's table had had no
// journey test since the old two-team screen was removed. Swapping `onScore` and
// `onMiss`, or breaking the starting-five gate, must make these tests fail —
// checked by mutation.
describe('the full run', () => {
  const ID = 'e2e'

  beforeEach(async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
    for (let i = 0; i < 6; i++)
      await savePlayer({ id: `p${i}`, teamId: 'ta', number: 4 + i, lastName: `NOM${i}`, firstName: 'X' })
    const m: Match = {
      id: ID, meta: { clubId: 'ta', opponentId: 'tb' },
      roster: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      events: [], status: 'live',
    }
    await saveSheet(null, m)
  })

  const renderE2E = (onFinish = vi.fn()) =>
    render(<AuthProvider><MemoryRouter><LiveMatch matchId={ID} onFinish={onFinish} /></MemoryRouter></AuthProvider>)

  it('starting five → located basket → missed shot → substitution → finish', async () => {
    // jsdom computes no layout: the court's box is pinned to 300×280, so a tap at
    // (150, 42) lands in the paint and one at (150, 252) behind the three-point line.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)
    const onFinish = vi.fn()
    renderE2E(onFinish)

    // 1. The starting-five gate: five starters, then the start
    await waitFor(() => screen.getByText(/Cinq de départ/i))
    await screen.findByRole('button', { name: /NOM0/ })
    for (let i = 0; i < 5; i++)
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`NOM${i}`) }))
    const start = screen.getByRole('button', { name: /Démarrer le match/i })
    await waitFor(() => expect(start).not.toBeDisabled())
    await userEvent.click(start)
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'STARTING_FIVE')).toHaveLength(1)
    })

    // 2. The live screen replaces the gate
    await waitFor(() => expect(screen.queryByText(/Cinq de départ/i)).not.toBeInTheDocument())

    // The clock must run for a SCORE or MISS to be accepted by the rules
    await userEvent.click(screen.getByRole('button', { name: /Démarrer$/ }))

    // 3. A two-point basket inside from one of our players, with its shot spot
    await userEvent.click(screen.getByRole('button', { name: /NOM0/ }))
    fireEvent.click(await screen.findByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 42 })
    await userEvent.click(screen.getByRole('button', { name: 'Valider le tir' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'SCORE' && e.team === 'A')).toHaveLength(1)
    })
    const afterScore = await getMatch(ID)
    expect(afterScore!.events.find((e) => e.type === 'SCORE')).toMatchObject({
      kind: '2int', playerId: 'p0', shot: { x: expect.any(Number), y: expect.any(Number) },
    })
    // The pass, asked right after: one of the four others on the court.
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '5 NOM1' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'STAT')).toEqual([expect.objectContaining({ stat: 'assist', playerId: 'p1' })])
    })

    // 4. A three-pointer from another player, shot spot recorded
    await userEvent.keyboard('{Escape}') // closes the dialog before opening another
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /NOM1/ }))
    fireEvent.click(await screen.findByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 252 })
    await userEvent.click(screen.getByRole('button', { name: 'Valider le tir' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'SCORE' && e.playerId === 'p1')).toHaveLength(1)
    })
    const afterThree = await getMatch(ID)
    expect(afterThree!.events.find((e) => e.type === 'SCORE' && e.playerId === 'p1')).toMatchObject({
      kind: '3', shot: { x: expect.any(Number), y: expect.any(Number) },
    })

    // 5. A missed shot from a third player: no change to the score
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const scoreBefore = (await getMatch(ID))!.events.filter((e) => e.type === 'SCORE').length
    await userEvent.click(screen.getByRole('button', { name: /NOM2/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Manqué' }))
    fireEvent.click(await screen.findByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 42 })
    await userEvent.click(screen.getByRole('button', { name: 'Valider le tir' }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.filter((e) => e.type === 'MISS')).toHaveLength(1)
    })
    const afterMiss = await getMatch(ID)
    expect(afterMiss!.events.filter((e) => e.type === 'SCORE')).toHaveLength(scoreBefore)

    // 6. A substitution from the substitution dialog
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Changement VIGNOT/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /NOM0/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /NOM5/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /valider/i }))
    await waitFor(async () => {
      const s = await getMatch(ID)
      expect(s!.events.some((e) => e.type === 'SUBSTITUTION')).toBe(true)
    })

    // 7. Fin de match
    await userEvent.click(screen.getByRole('button', { name: /Terminer/ }))
    const confirm = await screen.findByRole('dialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /^Terminer$/ }))
    await waitFor(() => expect(onFinish).toHaveBeenCalled())
    expect((await getMatch(ID))!.status).toBe('finished')
  })
})

describe('LiveMatch — rights', () => {
  it('the staff records the game without being asked for any code', async () => {
    // The heart of the model: the volunteer keeps the sheet without holding the admin code.
    sessionStorage.setItem(ROLE_KEY, 'staff')
    renderLive()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))

    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      expect(saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')).toHaveLength(1)
    })
  })

  it('a visitor records nothing: the screen announces the staff access instead of the sheet', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    renderLive()
    expect(await screen.findByRole('heading', { name: /Accès Staff requis/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter 2 points à VERDUN' })).not.toBeInTheDocument()
  })
})
