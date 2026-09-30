// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDb } from './testdb.js'

const t = testDb()

const team = (id: string) => t.db().query('insert into teams (id, name) values ($1, $1)', [id])
const game = async (id = 'm1') => {
  await team('a'); await team('b')
  await t.db().query("insert into matches (id, club_id, opponent_id, status) values ($1, 'a', 'b', 'live')", [id])
}
const event = (id: string, cols: Record<string, unknown>) => {
  const all = { id, match_id: 'm1', wall_clock: new Date(), period: 1, game_clock: 600, ...cols }
  const keys = Object.keys(all)
  return t.db().query(
    `insert into match_events (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(all))
}
const rev = async () => (await t.db().query<{ rev: string }>("select rev from matches where id = 'm1'")).rows[0].rev

describe.skipIf(!t.ready)('the schema', () => {
  it('refuses a player whose team does not exist', async () => {
    await expect(t.db().query("insert into players (id, team_id, number, last_name, first_name) values ('p', 'nope', 4, 'X', 'Y')"))
      .rejects.toMatchObject({ code: '23503' })
  })

  it('accepts each event type with its columns, and refuses it without them', async () => {
    await game()
    await t.db().query("insert into players (id, team_id, number, last_name, first_name) values ('p1', 'a', 4, 'X', 'Y')")
    await event('e1', { type: 'SCORE', team: 'A', player_id: 'p1', score_kind: '2int' })
    await event('e2', { type: 'MISS', team: 'A', player_id: 'p1', score_kind: '3', shot_x: 0.1, shot_y: 0.8 })
    await event('e3', { type: 'FOUL', team: 'A', foul_type: 'personal', foul_target: 'player', player_id: 'p1' })
    await event('e4', { type: 'PERIOD_START' })
    await expect(event('x1', { type: 'SCORE', team: 'A' })).rejects.toMatchObject({ constraint: 'event_shape' })
    await expect(event('x2', { type: 'MISS', team: 'A', player_id: 'p1', score_kind: '3' })).rejects.toMatchObject({ constraint: 'event_shape' })
    await expect(event('x3', { type: 'FOUL', team: 'A', foul_type: 'personal', foul_target: 'player' })).rejects.toMatchObject({ constraint: 'event_shape' })
    await expect(event('x4', { type: 'NOPE' })).rejects.toMatchObject({ constraint: 'event_shape' })
    await expect(event('x5', { type: 'SCORE', team: 'A', score_kind: '2int', shot_x: 0.5 })).rejects.toMatchObject({ constraint: 'shot_pair' })
  })

  it('bumps the revision on an event added and on an event archived', async () => {
    await game()
    expect(await rev()).toBe('0')
    await event('e1', { type: 'PERIOD_START' })
    expect(await rev()).toBe('1')
    await t.db().query("update match_events set archived_at = now() where id = 'e1'")
    expect(await rev()).toBe('2')
  })

  it('hides what hangs off an archived team, and brings it back when un-archived', async () => {
    await game()
    await t.db().query("insert into players (id, team_id, number, last_name, first_name) values ('p1', 'a', 4, 'X', 'Y')")
    await t.db().query("insert into convocations (match_id) values ('m1')")
    const visible = async () => (await t.db().query(`select
      (select count(*) from active_players)::int as players,
      (select count(*) from active_matches)::int as matches,
      (select count(*) from active_convocations)::int as convocations`)).rows[0]

    expect(await visible()).toEqual({ players: 1, matches: 1, convocations: 1 })
    await t.db().query("update teams set archived_at = now() where id = 'a'")
    expect(await visible()).toEqual({ players: 0, matches: 0, convocations: 0 })
    await t.db().query("update teams set archived_at = null where id = 'a'")
    expect(await visible()).toEqual({ players: 1, matches: 1, convocations: 1 })
  })

  it('records a migration once', async () => {
    const { migrate } = await import('./migrate.js')
    expect(await migrate(t.db())).toEqual([])
  })
})
