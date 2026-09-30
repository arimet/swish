import type { FoulTarget, GameEvent } from '../../src/domain/types.js'
import { BadRequest, type Db } from './db.js'

export interface EventRow {
  id: string; match_id: string; seq?: string; wall_clock_ms: number; period: number; game_clock: number
  type: GameEvent['type']; team: 'A' | 'B' | null
  player_id: string | null; player_in_id: string | null; player_out_id: string | null
  score_kind: string | null; stat: string | null; foul_type: string | null; foul_target: FoulTarget['kind'] | null
  shot_x: number | null; shot_y: number | null
}

/** The columns read back, the wall clock in milliseconds as the domain counts it. */
export const EVENT_COLUMNS = `id, match_id, seq, (extract(epoch from wall_clock) * 1000)::float8 as wall_clock_ms,
  period, game_clock, type, team, player_id, player_in_id, player_out_id,
  score_kind, stat, foul_type, foul_target, shot_x, shot_y`

export function eventToRow(matchId: string, e: GameEvent): EventRow {
  const row: EventRow = {
    id: e.id, match_id: matchId, wall_clock_ms: e.wallClock, period: e.period, game_clock: e.gameClock,
    type: e.type, team: null, player_id: null, player_in_id: null, player_out_id: null,
    score_kind: null, stat: null, foul_type: null, foul_target: null, shot_x: null, shot_y: null,
  }
  switch (e.type) {
    case 'STARTING_FIVE': return { ...row, team: e.team }
    case 'SCORE': return { ...row, team: e.team, player_id: e.playerId ?? null, score_kind: e.kind, shot_x: e.shot?.x ?? null, shot_y: e.shot?.y ?? null }
    case 'MISS': return { ...row, team: e.team, player_id: e.playerId, score_kind: e.kind, shot_x: e.shot.x, shot_y: e.shot.y }
    case 'FOUL': return { ...row, team: e.team, foul_type: e.foulType, foul_target: e.target.kind, player_id: e.target.kind === 'player' ? e.target.playerId : null }
    case 'TIMEOUT': return { ...row, team: e.team }
    case 'SUBSTITUTION': return { ...row, team: e.team, player_in_id: e.playerInId, player_out_id: e.playerOutId }
    case 'STAT': return { ...row, team: e.team, player_id: e.playerId, stat: e.stat }
    default: return row
  }
}

/** `starters` fills the `STARTING_FIVE` event: the five live in `match_roster`,
 *  where Postgres can check each of them against `players`. */
export function eventFromRow(r: EventRow, starters: string[]): GameEvent {
  const base = { id: r.id, wallClock: Math.round(r.wall_clock_ms), period: r.period, gameClock: r.game_clock }
  const team = r.team as 'A' | 'B'
  const shot = r.shot_x === null ? undefined : { x: r.shot_x, y: r.shot_y! }
  switch (r.type) {
    case 'STARTING_FIVE': return { ...base, type: r.type, team, playerIds: starters }
    case 'SCORE': return {
      ...base, type: r.type, team, kind: r.score_kind as never,
      ...(r.player_id ? { playerId: r.player_id } : {}), ...(shot ? { shot } : {}),
    }
    case 'MISS': return { ...base, type: r.type, team, playerId: r.player_id!, kind: r.score_kind as never, shot: shot! }
    case 'FOUL': return {
      ...base, type: r.type, team, foulType: r.foul_type as never,
      target: r.foul_target === 'player' ? { kind: 'player', playerId: r.player_id! } : { kind: r.foul_target as 'coach' | 'bench' },
    }
    case 'TIMEOUT': return { ...base, type: r.type, team }
    case 'SUBSTITUTION': return { ...base, type: r.type, team, playerInId: r.player_in_id!, playerOutId: r.player_out_id! }
    case 'STAT': return { ...base, type: r.type, team, playerId: r.player_id!, stat: r.stat as never }
    default: return { ...base, type: r.type } as GameEvent
  }
}

/**
 * Adds and archives a game's events, in the caller's transaction.
 *
 * An id already stored is skipped rather than refused: a request retried after its
 * answer was lost must not score the basket twice. An archive of an id unknown or
 * already archived does nothing, for the same reason — the state asked for is reached.
 */
export async function writeEvents(db: Db, matchId: string, add: GameEvent[], archive: string[]): Promise<void> {
  for (const e of add) {
    const r = eventToRow(matchId, e)
    await db.query(
      `insert into match_events (id, match_id, wall_clock, period, game_clock, type, team, player_id,
         player_in_id, player_out_id, score_kind, stat, foul_type, foul_target, shot_x, shot_y)
       values ($1, $2, to_timestamp($3 / 1000.0), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict (id) do nothing`,
      [r.id, r.match_id, r.wall_clock_ms, r.period, r.game_clock, r.type, r.team, r.player_id,
        r.player_in_id, r.player_out_id, r.score_kind, r.stat, r.foul_type, r.foul_target, r.shot_x, r.shot_y])
    if (e.type === 'STARTING_FIVE') {
      const { rowCount } = await db.query(
        `update match_roster set starter_rank = array_position($2::text[], player_id) - 1 where match_id = $1`,
        [matchId, e.playerIds])
      const { rows } = await db.query<{ n: number }>(
        'select count(*)::int as n from match_roster where match_id = $1 and starter_rank is not null', [matchId])
      if (!rowCount || rows[0].n !== e.playerIds.length) throw new BadRequest('starting five outside the roster')
    }
  }
  for (const id of archive) {
    await db.query('update match_events set archived_at = now() where id = $1 and match_id = $2 and archived_at is null', [id, matchId])
  }
}
