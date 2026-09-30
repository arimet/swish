import type { GameEvent, Match } from '../../src/domain/types.js'
import { compact, type Db, type Store } from './db.js'
import { EVENT_COLUMNS, eventFromRow, type EventRow } from './events.js'

interface Row {
  id: string; club_id: string; opponent_id: string; status: Match['status']
  date: string | null; time: string | null; venue: string | null
  championship_label: string | null; championship_code: string | null; match_number: string | null; pool: string | null
  referee1: string | null; referee2: string | null; referee3: string | null; coach_a: string | null
}
const COLUMNS: (keyof Row)[] = ['id', 'club_id', 'opponent_id', 'status', 'date', 'time', 'venue', 'championship_label',
  'championship_code', 'match_number', 'pool', 'referee1', 'referee2', 'referee3', 'coach_a']

interface RosterRow { match_id: string; player_id: string; starter_rank: number | null }

export const toRow = (m: Match): Row => ({
  id: m.id, club_id: m.meta.clubId, opponent_id: m.meta.opponentId, status: m.status,
  date: m.meta.date ?? null, time: m.meta.time ?? null, venue: m.meta.venue ?? null,
  championship_label: m.meta.championshipLabel ?? null, championship_code: m.meta.championshipCode ?? null,
  match_number: m.meta.matchNumber ?? null, pool: m.meta.pool ?? null,
  referee1: m.meta.referee1 ?? null, referee2: m.meta.referee2 ?? null, referee3: m.meta.referee3 ?? null,
  coach_a: m.meta.coachA ?? null,
})

export const fromRows = (r: Row, roster: RosterRow[], events: GameEvent[]): Match => ({
  id: r.id,
  meta: compact({
    championshipLabel: r.championship_label, championshipCode: r.championship_code, matchNumber: r.match_number,
    date: r.date, time: r.time, venue: r.venue, pool: r.pool,
    referee1: r.referee1, referee2: r.referee2, referee3: r.referee3, coachA: r.coach_a,
    clubId: r.club_id, opponentId: r.opponent_id,
  }),
  roster: roster.map((x) => x.player_id),
  events,
  status: r.status,
})

/** Games, their rosters and their events in three queries, whatever the number of
 *  games: the season screens read them all. The roster reads `match_roster` whole, not
 *  through `active_players` — an archived player keeps their line on the sheets they
 *  played. */
async function assemble(db: Db, rows: Row[]): Promise<Match[]> {
  const ids = rows.map((r) => r.id)
  const [roster, events] = await Promise.all([
    db.query<RosterRow>('select match_id, player_id, starter_rank from match_roster where match_id = any($1::text[]) order by match_id, rank', [ids]),
    db.query<EventRow>(`select ${EVENT_COLUMNS} from active_match_events where match_id = any($1::text[]) order by position`, [ids]),
  ])
  return rows.map((r) => {
    const own = roster.rows.filter((x) => x.match_id === r.id)
    const starters = own.filter((x) => x.starter_rank !== null).sort((a, b) => a.starter_rank! - b.starter_rank!).map((x) => x.player_id)
    return fromRows(r, own, events.rows.filter((e) => e.match_id === r.id).map((e) => eventFromRow(e, starters)))
  })
}

const select = `select ${COLUMNS.join(', ')} from active_matches`

export const matches: Store<Match> = {
  async list(db) {
    return assemble(db, (await db.query<Row>(select)).rows)
  },
  async get(db, id) {
    const { rows } = await db.query<Row>(`${select} where id = $1`, [id])
    return rows[0] ? (await assemble(db, rows))[0] : null
  },
  /** Meta, status and roster. **Never the events**: they go through `writeEvents`, one
   *  at a time, so that two devices on one game cannot overwrite each other. */
  async put(db, id, m) {
    const row = toRow({ ...m, id })
    const updates = COLUMNS.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')
    await db.query(
      `insert into matches (${COLUMNS.join(', ')}) values (${COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})
       on conflict (id) do update set ${updates}, rev = matches.rev + 1, archived_at = null`,
      COLUMNS.map((c) => row[c]))
    await db.query('delete from match_roster where match_id = $1 and not (player_id = any($2::text[]))', [id, m.roster])
    for (const [rank, playerId] of m.roster.entries()) {
      await db.query(
        `insert into match_roster (match_id, player_id, rank) values ($1, $2, $3)
         on conflict (match_id, player_id) do update set rank = excluded.rank`, [id, playerId, rank])
    }
  },
  async archive(db, id) {
    await db.query('update matches set archived_at = now(), rev = rev + 1 where id = $1 and archived_at is null', [id])
  },
}
