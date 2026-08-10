import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveTeam, listTeams, saveMatch, getMatch, listMatches, deleteMatch } from './repositories'
import type { Match } from '../domain/types'

beforeEach(async () => {
  await db.teams.clear(); await db.players.clear(); await db.matches.clear()
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
})
