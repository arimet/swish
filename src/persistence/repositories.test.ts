import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveTeam, listTeams, saveMatch, getMatch, listMatches, deleteMatch, deleteTeam, saveResult, listResults, savePlayer, deletePlayer, saveTraining, listTrainings, saveConvocation, getConvocation } from './repositories'
import type { Match } from '../domain/types'

beforeEach(async () => {
  await db.teams.clear(); await db.players.clear(); await db.matches.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear()
})

const match = (id: string): Match => ({
  id, meta: { championshipLabel: 'PRM', clubId: 'a', opponentId: 'b' },
  roster: [], events: [], status: 'setup',
})

describe('repositories', () => {
  it('sauvegarde et liste les équipes', async () => {
    await saveTeam({ id: 't1', name: 'VIGNOT' })
    expect((await listTeams()).map((t) => t.name)).toContain('VIGNOT')
  })
  it('sauvegarde, relit et supprime un match', async () => {
    await saveMatch(match('m1'))
    expect((await getMatch('m1'))?.id).toBe('m1')
    expect(await listMatches()).toHaveLength(1)
    await deleteMatch('m1')
    expect(await getMatch('m1')).toBeUndefined()
  })
  it('persiste le journal d\'evenements', async () => {
    const m = match('m2')
    m.events.push({ id: 'e1', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })
    await saveMatch(m)
    expect((await getMatch('m2'))?.events).toHaveLength(1)
  })
  it('supprime les résultats saisis qui mentionnent une équipe supprimée, des deux côtés', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveTeam({ id: 'tb', name: 'VERDUN' })
    await saveTeam({ id: 'tc', name: 'METZ' })
    // « ta » supprimée : le premier résultat (ta reçoit tb) et le second (tc reçoit ta)
    // la mentionnent chacun d'un côté différent — les deux doivent disparaître.
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'ta', awayId: 'tb', homeScore: 70, awayScore: 60 })
    await saveResult({ id: 'r2', championshipLabel: 'Poule A', date: '2026-01-17', homeId: 'tc', awayId: 'ta', homeScore: 55, awayScore: 80 })
    await saveResult({ id: 'r3', championshipLabel: 'Poule A', date: '2026-01-17', homeId: 'tb', awayId: 'tc', homeScore: 60, awayScore: 50 })

    await deleteTeam('ta')

    expect((await listResults()).map((r) => r.id)).toEqual(['r3'])
  })

  it('supprime les entraînements du club supprimé, comme les résultats', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-10' })
    await saveTraining({ id: 'tr2', clubId: 'ta', date: '2026-01-15' })
    await saveTraining({ id: 'tr3', clubId: 'tb', date: '2026-01-10' })

    await deleteTeam('ta')

    expect((await listTrainings()).map((t) => t.id)).toEqual(['tr3'])
  })

  it('retire un joueur supprimé de toutes les convocations qui le mentionnent', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
    await savePlayer({ id: 'p2', teamId: 'ta', number: 7, lastName: 'BERNARD', firstName: 'Hugo' })
    await saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2'] })
    await saveConvocation({ matchId: 'm2', playerIds: ['p2'] })

    await deletePlayer('p2')

    expect((await getConvocation('m1'))?.playerIds).toEqual(['p1'])
    expect((await getConvocation('m2'))?.playerIds).toEqual([])
  })
})
