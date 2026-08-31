import { describe, expect, it } from 'vitest'
import { count } from '../test/fakeApi'
import { saveTeam, listTeams, saveMatch, getMatch, listMatches, deleteMatch, deleteTeam, saveResult, listResults, savePlayer, deletePlayer, saveTraining, listTrainings, saveConvocation, getConvocation, savePlay, listPlays, getPlay, deletePlay, deleteMatchesWhere, clearClubStats, deleteAllResults, deleteTrainingsOfClub, deletePlaysOfClub, wipeAll, getMessage, saveMessage, deleteMessage } from './repositories'
import { newPlay } from '../domain/plays'
import { hasEvents, ofYear, ofLeague } from '../domain/cleanup'
import type { GameEvent, Match } from '../domain/types'

const match = (id: string): Match => ({
  id, meta: { championshipLabel: 'PRM', clubId: 'a', opponentId: 'b' },
  roster: [], events: [], status: 'setup',
})

describe('repositories', () => {
  it('saves and lists the teams', async () => {
    await saveTeam({ id: 't1', name: 'VIGNOT' })
    expect((await listTeams()).map((t) => t.name)).toContain('VIGNOT')
  })
  it('saves, reads back and deletes a game', async () => {
    await saveMatch(match('m1'))
    expect((await getMatch('m1'))?.id).toBe('m1')
    expect(await listMatches()).toHaveLength(1)
    await deleteMatch('m1')
    expect(await getMatch('m1')).toBeUndefined()
  })
  it('persists the event log', async () => {
    const m = match('m2')
    m.events.push({ id: 'e1', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })
    await saveMatch(m)
    expect((await getMatch('m2'))?.events).toHaveLength(1)
  })
  it('deletes entered results mentioning a deleted team, on either side', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveTeam({ id: 'tb', name: 'VERDUN' })
    await saveTeam({ id: 'tc', name: 'METZ' })
    // "ta" deleted: the first result (ta hosts tb) and the second (tc hosts ta) each
    // mention it on a different side — both must disappear.
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'ta', awayId: 'tb', homeScore: 70, awayScore: 60 })
    await saveResult({ id: 'r2', championshipLabel: 'Poule A', date: '2026-01-17', homeId: 'tc', awayId: 'ta', homeScore: 55, awayScore: 80 })
    await saveResult({ id: 'r3', championshipLabel: 'Poule A', date: '2026-01-17', homeId: 'tb', awayId: 'tc', homeScore: 60, awayScore: 50 })

    await deleteTeam('ta')

    expect((await listResults()).map((r) => r.id)).toEqual(['r3'])
  })

  it('deletes the deleted club\'s trainings, like the results', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-10' })
    await saveTraining({ id: 'tr2', clubId: 'ta', date: '2026-01-15' })
    await saveTraining({ id: 'tr3', clubId: 'tb', date: '2026-01-10' })

    await deleteTeam('ta')

    expect((await listTrainings()).map((t) => t.id)).toEqual(['tr3'])
  })

  it('removes a deleted player from every call-up that mentions them', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
    await savePlayer({ id: 'p2', teamId: 'ta', number: 7, lastName: 'BERNARD', firstName: 'Hugo' })
    await saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2'] })
    await saveConvocation({ matchId: 'm2', playerIds: ['p2'] })

    await deletePlayer('p2')

    expect((await getConvocation('m1'))?.playerIds).toEqual(['p1'])
    expect((await getConvocation('m2'))?.playerIds).toEqual([])
  })

  it('saves, lists per club and deletes a play', async () => {
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'PnR haut' })
    await savePlay({ id: 's2', ...newPlay('tb', 'half', false), name: 'Autre club' })
    expect((await listPlays('ta')).map((s) => s.id)).toEqual(['s1'])
    expect((await getPlay('s1'))?.name).toBe('PnR haut')
    await deletePlay('s1')
    expect(await listPlays('ta')).toEqual([])
    expect(await getPlay('s1')).toBeUndefined()
  })

  it('deleting a team takes its plays', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'PnR haut' })
    await savePlay({ id: 's2', ...newPlay('tb', 'half', false), name: 'Autre club' })
    await deleteTeam('ta')
    expect(await listPlays('ta')).toEqual([])
    expect((await listPlays('tb')).map((s) => s.id)).toEqual(['s2'])
  })

  it('stamps the time on every play saved', async () => {
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    const relu = (await getPlay('s1'))!
    expect(relu.updatedAt).toBeTruthy()
    expect(Number.isNaN(Date.parse(relu.updatedAt!))).toBe(false)
  })

  it('deleting a play removes it from the trainings that cited it', async () => {
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await savePlay({ id: 's2', ...newPlay('ta', 'half', false), name: 'B' })
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })
    await deletePlay('s1')
    expect((await listTrainings())[0].playIds).toEqual(['s2'])
  })

  it('deletes two plays in quick succession without an id coming back', async () => {
    // Reading the sessions before the transaction is taking a snapshot: both deletions
    // would start from the same state and the second would reinstate the id the first
    // had just removed, for good.
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await savePlay({ id: 's2', ...newPlay('ta', 'half', false), name: 'B' })
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })

    await Promise.all([deletePlay('s1'), deletePlay('s2')])

    expect((await listTrainings())[0].playIds).toEqual([])
    expect(await listPlays('ta')).toEqual([])
  })
})

// ── The team message ────────────────────────────────────────────────────────
// One message at a time per club: the key is the club, not the message. Writing a new
// one replaces the previous; there is nothing to file and nothing to purge.

describe('the team message', () => {
  it('saves a message and reads it back as it is', async () => {
    await saveMessage({ clubId: 'ta', text: 'Pas d’entraînement mardi, gymnase fermé.', writtenAt: '2026-08-10T18:00:00.000Z' })
    const relu = await getMessage('ta')
    expect(relu?.text).toBe('Pas d’entraînement mardi, gymnase fermé.')
    expect(relu?.writtenAt).toBe('2026-08-10T18:00:00.000Z')
  })

  it('keeps only one per club: the second replaces the first', async () => {
    await saveMessage({ clubId: 'ta', text: 'Premier', writtenAt: '2026-08-10T18:00:00.000Z' })
    await saveMessage({ clubId: 'ta', text: 'Second', writtenAt: '2026-08-12T18:00:00.000Z' })
    expect((await getMessage('ta'))?.text).toBe('Second')
    expect(count('message')).toBe(1)
  })

  it('keeps two clubs\' messages apart', async () => {
    await saveMessage({ clubId: 'ta', text: 'Chez nous', writtenAt: '2026-08-10T18:00:00.000Z' })
    await saveMessage({ clubId: 'tb', text: 'Chez eux', writtenAt: '2026-08-10T18:00:00.000Z' })
    expect((await getMessage('ta'))?.text).toBe('Chez nous')
    expect((await getMessage('tb'))?.text).toBe('Chez eux')
  })

  it('erases one club\'s message without touching the neighbour\'s', async () => {
    await saveMessage({ clubId: 'ta', text: 'Chez nous', writtenAt: '2026-08-10T18:00:00.000Z' })
    await saveMessage({ clubId: 'tb', text: 'Chez eux', writtenAt: '2026-08-10T18:00:00.000Z' })
    await deleteMessage('ta')
    expect(await getMessage('ta')).toBeUndefined()
    expect(await getMessage('tb')).toBeDefined()
  })

  it('deleting the team takes its message', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: '2026-08-10T18:00:00.000Z' })
    await saveMessage({ clubId: 'tb', text: 'Chez eux', writtenAt: '2026-08-10T18:00:00.000Z' })

    await deleteTeam('ta')

    expect(await getMessage('ta')).toBeUndefined()
    expect(await getMessage('tb')).toBeDefined()
  })
})

// ── Ménage d'administration : suppressions groupées, irréversibles ───────────
// Each must take ONLY its own scope: a cleanup operation that overreaches cannot be
// undone, there is no bin.

const evt = (id: string): GameEvent => ({ id, type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })

const rencontre = (id: string, champ: string, date: string | undefined, clubId = 'ta', events: GameEvent[] = []): Match => ({
  id, meta: { championshipLabel: champ, date, clubId, opponentId: 'tb' }, roster: [], events, status: events.length ? 'finished' : 'setup',
})

describe('bulk cleanup', () => {
  it('deletes a league\'s games and their call-ups, leaving the others intact', async () => {
    await saveMatch(rencontre('m1', 'Poule A', '2026-01-10'))
    await saveMatch(rencontre('m2', 'Poule A', '2026-01-17'))
    await saveMatch(rencontre('m3', 'Poule B', '2026-01-17'))
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await saveConvocation({ matchId: 'm3', playerIds: ['p1'] })

    const deleted = await deleteMatchesWhere(ofLeague('Poule A'))

    expect(deleted.sort()).toEqual(['m1', 'm2'])
    expect((await listMatches()).map((m) => m.id)).toEqual(['m3'])
    expect(await getConvocation('m1')).toBeUndefined()
    expect(await getConvocation('m3')).toBeDefined()
  })

  it('deletes a calendar year\'s games, without touching the other years or the undated games', async () => {
    await saveMatch(rencontre('m1', 'Poule A', '2025-11-08'))
    await saveMatch(rencontre('m2', 'Poule A', '2026-01-17'))
    await saveMatch(rencontre('m3', 'Poule A', undefined))

    await deleteMatchesWhere(ofYear('2026'))

    expect((await listMatches()).map((m) => m.id).sort()).toEqual(['m1', 'm3'])
  })

  it('empties a club\'s sheets without deleting its games or their dates', async () => {
    await saveMatch(rencontre('m1', 'Poule A', '2026-01-10', 'ta', [evt('e1'), evt('e2')]))
    await saveMatch(rencontre('m2', 'Poule A', '2026-01-17', 'tz', [evt('e3')]))
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })

    const cleared = await clearClubStats('ta')

    expect(cleared).toBe(1)
    const m1 = await getMatch('m1')
    expect(m1?.events).toEqual([])
    expect(m1?.meta.date).toBe('2026-01-10')
    // The sheet is blank: the game is no longer "finished", otherwise it would show
    // 0–0 like a score actually observed.
    expect(m1?.status).toBe('setup')
    // The neighbouring club and the call-up do not move: emptying is not deleting.
    expect((await getMatch('m2'))?.events).toHaveLength(1)
    expect(await getConvocation('m1')).toBeDefined()
  })

  it('deletes in bulk the entered results, the club\'s trainings and its plays', async () => {
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await saveTraining({ id: 'tr2', clubId: 'tz', date: '2026-01-05' })
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await savePlay({ id: 's2', ...newPlay('tz', 'half', false), name: 'B' })

    await deleteAllResults()
    await deleteTrainingsOfClub('ta')
    await deletePlaysOfClub('ta')

    expect(await listResults()).toEqual([])
    expect((await listTrainings()).map((t) => t.id)).toEqual(['tr2'])
    expect(await listPlays('ta')).toEqual([])
    expect((await listPlays('tz')).map((s) => s.id)).toEqual(['s2'])
  })

  it('removes from the sessions kept the plays deleted in bulk, leaving no orphan id', async () => {
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await savePlay({ id: 's2', ...newPlay('ta', 'half', false), name: 'B' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })

    await deletePlaysOfClub('ta')

    expect((await listTrainings())[0].playIds).toEqual([])
  })

  it('deletes two clubs\' plays in quick succession without an id coming back', async () => {
    // The same trap as `deletePlay`: reading the sessions before the transaction is
    // taking a snapshot — both cleanups would start from the same state and the second
    // would reinstate the id the first had just removed, for good.
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await savePlay({ id: 's2', ...newPlay('tz', 'half', false), name: 'B' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })

    await Promise.all([deletePlaysOfClub('ta'), deletePlaysOfClub('tz')])

    expect((await listTrainings())[0].playIds).toEqual([])
  })

  it('empties the database, every kind of document', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
    await saveMatch(rencontre('m1', 'Poule A', '2026-01-10', 'ta', [evt('e1')]))
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: '2026-08-10T18:00:00.000Z' })

    await wipeAll()

    // The eight kinds, including the two filed under something other than an `id`:
    // a call-up left behind would be invisible and immovable.
    expect(['team', 'player', 'match', 'result', 'convocation', 'training', 'play', 'message'].map(count))
      .toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('counts as a sheet to empty only a game that carries events', async () => {
    // The count announced on screen is that of what will actually be destroyed: a game
    // still blank has nothing to lose and must not inflate it.
    await saveMatch(rencontre('vierge', 'Poule A', '2026-01-10', 'ta'))
    await saveMatch(rencontre('remplie', 'Poule A', '2026-01-17', 'ta', [evt('e1')]))

    expect((await listMatches()).filter(hasEvents('ta'))).toHaveLength(1)
    expect(await clearClubStats('ta')).toBe(1)
  })
})
