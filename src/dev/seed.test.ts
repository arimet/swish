import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedDocuments } from './seed'
import { mutate, writeEvents } from '../persistence/api'
import { getConvocation, listMatches, listPlayers, listPlays, listResults, listTeams, listTrainings } from '../persistence/repositories'
import { folders } from '../domain/plays'
import { standings } from '../domain/standings'
import { playerStats } from '../domain/boxscore'
import { liveState } from '../rules/ffbb'
import type { Match } from '../domain/types'

/* The season is written the way `scripts/db.mjs seed` writes it: one batch of the
   documents `seedDocuments` hands over, then each game's events through their own
   route, since a game's `put` carries none. Nothing else seeds — the application
   does not.

   The clock is pinned to the day the calendar was copied from the federation: the
   demo plays go to the next session *from today*, and a test that read the real clock
   would start failing once the season is over. Only `Date` is faked — the fake API's
   promises must still resolve. */
beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-09-30T12:00:00'), toFake: ['Date'] })
  const docs = seedDocuments()
  await mutate(docs.map(({ kind, id, doc }) => ({ kind, op: 'put' as const, id, doc: kind === 'match' ? { ...(doc as Match), events: [] } : doc })))
  for (const { kind, id, doc } of docs) if (kind === 'match') await writeEvents(id, (doc as Match).events, [])
})
afterEach(() => { vi.useRealTimers() })

describe('demo data', () => {
  it('creates only the teams that play', async () => {
    const teams = await listTeams()
    const matches = await listMatches()
    const utilisees = new Set(matches.flatMap((m) => [m.meta.clubId, m.meta.opponentId]))
    expect(teams).toHaveLength(11)
    expect(teams.every((t) => utilisees.has(t.id))).toBe(true)
  })

  it('creates no opposition roster', async () => {
    const matches = await listMatches()
    const opponents = new Set(matches.map((m) => m.meta.opponentId))
    for (const id of opponents) expect(await listPlayers(id)).toHaveLength(0)
  })

  it('files the season as published: twenty games, one played, one live, home games at the club', async () => {
    const matches = await listMatches()
    expect(matches).toHaveLength(20)
    expect(matches.filter((m) => m.status === 'finished')).toHaveLength(1)
    expect(matches.filter((m) => m.status === 'live')).toHaveLength(1)
    expect(matches.filter((m) => m.status === 'setup')).toHaveLength(18)
    expect(matches.filter((m) => m.meta.venue === 'SALLE POLYVALENTE DES OUILLONS')).toHaveLength(10)
  })

  it('the game played carries its final score and nothing invented', async () => {
    const played = (await listMatches()).find((m) => m.status === 'finished')!
    expect(liveState(played).score).toEqual({ a: 70, b: 62 })
    // No scorer, no shot, no statistic: the federation publishes the score only.
    expect(played.events.some((e) => 'playerId' in e && e.playerId)).toBe(false)
    expect(playerStats(played).every((s) => s.points === 0)).toBe(true)
  })

  it('opens the live game at tip-off: the named five on court, nothing invented', async () => {
    const [live] = (await listMatches()).filter((m) => m.status === 'live')
    const players = await listPlayers(live.meta.clubId)
    const state = liveState(live)
    expect(live.meta.date).toBe('2026-10-03')
    expect(state.score).toEqual({ a: 0, b: 0 })
    expect(state.onCourt.A.map((id) => players.find((p) => p.id === id)!.number).sort((x, y) => x - y)).toEqual([2, 11, 13, 15, 17])
  })

  it('gives the standings the federation shows after matchday 1', async () => {
    const [matches, results, teams] = await Promise.all([listMatches(), listResults(), listTeams()])
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
    const lines = standings(matches, results, byId)[0].lines
    expect(lines.slice(0, 4).map((l) => l.name)).toEqual([
      'CSLB BAR LE DUC - 1', 'ASC CHARNY SUR MEUSE - 2', 'CSLB BAR LE DUC - 2', 'AVENIR DE VIGNOT - 1',
    ])
    // All eleven, the three that have not played yet at zero.
    expect(lines).toHaveLength(11)
    expect(lines.filter((l) => l.played === 0).map((l) => l.name).sort()).toEqual(
      ['ASC CHARNY SUR MEUSE - 4', "L'ESPERANCE DE STENAY", 'PAGNY SUR MEUSE BC'])
    const vignot = lines.find((l) => l.name === 'AVENIR DE VIGNOT - 1')!
    expect([vignot.wins, vignot.losses, vignot.pts]).toEqual([1, 0, 2])
  })

  it('files the other matchday-1 results, none of them ours and none a draw', async () => {
    const results = await listResults()
    const clubId = (await listMatches())[0].meta.clubId
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.homeId !== clubId && r.awayId !== clubId)).toBe(true)
    expect(results.every((r) => r.homeScore !== r.awayScore)).toBe(true)
  })

  it('creates trainings for our club, in the game weeks', async () => {
    const trainings = await listTrainings()
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    expect(trainings.length).toBeGreaterThan(0)
    // Without a clubId, a training would leak into any other club's calendar.
    expect(trainings.every((t) => t.clubId === clubId)).toBe(true)
  })

  it('puts the demo call-up on the next game, never on one already played', async () => {
    const matches = (await listMatches()).sort((a, b) => a.meta.date!.localeCompare(b.meta.date!))
    const next = matches.find((m) => m.status === 'setup')!
    expect(next.meta.date).toBe('2026-10-11')
    expect((await getConvocation(next.id))?.playerIds.length).toBeGreaterThan(0)
    for (const jouee of matches.filter((m) => m.status === 'finished')) {
      expect(await getConvocation(jouee.id)).toBeUndefined()
    }
  })

  it('the demo holds three plays, one of them on a full court and one with a loose ball', async () => {
    const matches = await listMatches()
    const plays = await listPlays(matches[0].meta.clubId)
    expect(plays).toHaveLength(3)
    expect(plays.filter((s) => s.court === 'full')).toHaveLength(1)
    // A ball on the floor is a Point; carried, it names a marker.
    expect(plays.filter((s) => 'x' in s.steps[0].ball)).toHaveLength(1)
    // Every step keeps its full complement — the defence only appears where the play
    // asks for it.
    for (const s of plays) for (const t of s.steps) expect(t.markers).toHaveLength(s.defense ? 10 : 5)
  })

  it('files the demo plays and attaches some to the next session', async () => {
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    const plays = await listPlays(clubId)
    // Two distinct folders: otherwise the library's bar would have a single tab and
    // would not show what it can do.
    expect(folders(plays)).toEqual(['Attaque placée', 'Remises en jeu'])
    expect(plays.every((s) => !!s.folder)).toBe(true)

    // The pick and roll runs all the way to the basket: the 5 reaches the end of their
    // cut and receives the ball, instead of a finish that existed only as arrows.
    const pnr = plays.find((s) => s.name.includes('Pick and roll'))!
    expect(pnr.steps).toHaveLength(4)
    const fin = pnr.steps[3]
    expect(fin.ball).toEqual({ side: 'offense', position: 5 })
    const fiveBefore = pnr.steps[2].markers.find((p) => p.side === 'offense' && p.position === 5)!
    const fiveAfter = fin.markers.find((p) => p.side === 'offense' && p.position === 5)!
    expect(fiveAfter.at.y).toBeLessThan(fiveBefore.at.y)
    // Near the basket (y = 0 at the baseline), and not halfway.
    expect(fiveAfter.at.y).toBeLessThan(0.25)

    // The next upcoming session carries two plays, both of which exist — an orphan id
    // would make the calendar's count lie.
    const today = new Date()
    const jour = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const prochaine = (await listTrainings()).filter((t) => t.date >= jour).sort((a, b) => a.date.localeCompare(b.date))[0]
    expect(prochaine.playIds).toHaveLength(2)
    const existing = new Set(plays.map((s) => s.id))
    expect(prochaine.playIds!.every((id) => existing.has(id))).toBe(true)
  })
})
