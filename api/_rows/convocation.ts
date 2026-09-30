import type { Convocation } from '../../src/domain/types.js'
import { compact, tableStore, type Db, type Store } from './db.js'

interface Row { match_id: string; meet_time: string | null; meet_place: string | null; note: string | null }

export const toRow = (c: Convocation): Row => ({
  match_id: c.matchId, meet_time: c.meetTime ?? null, meet_place: c.meetPlace ?? null, note: c.note ?? null,
})
export const fromRow = (r: Row, playerIds: string[]): Convocation => compact({
  matchId: r.match_id, playerIds, meetTime: r.meet_time, meetPlace: r.meet_place, note: r.note,
})

/** A call-up extends its game one-to-one: it has no `archived_at` and follows the
 *  game through `active_convocations`. */
const base = tableStore<Row, Row>({
  table: 'convocations', view: 'active_convocations', key: 'match_id',
  columns: ['match_id', 'meet_time', 'meet_place', 'note'], toRow: (r) => r, fromRow: (r) => r, archivable: false,
})

/** The players called up, archived players left out — the pruning `deletePlayer`
 *  used to do on the client. */
async function links(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ match_id: string; player_id: string }>(
    `select l.match_id, l.player_id from convocation_players l join active_players p on p.id = l.player_id
     where l.match_id = any($1::text[]) order by l.match_id, l.rank`, [ids])
  const out = new Map<string, string[]>()
  for (const r of rows) out.set(r.match_id, [...(out.get(r.match_id) ?? []), r.player_id])
  return out
}

export const convocations: Store<Convocation> = {
  async list(db) {
    const rows = await base.list(db)
    const l = await links(db, rows.map((r) => r.match_id))
    return rows.map((r) => fromRow(r, l.get(r.match_id) ?? []))
  },
  async get(db, id) {
    const row = await base.get(db, id)
    return row ? fromRow(row, (await links(db, [id])).get(id) ?? []) : null
  },
  async put(db, id, c) {
    await base.put(db, id, toRow({ ...c, matchId: id }))
    await db.query('delete from convocation_players where match_id = $1', [id])
    for (const [rank, playerId] of c.playerIds.entries()) {
      await db.query('insert into convocation_players (match_id, player_id, rank) values ($1, $2, $3)', [id, playerId, rank])
    }
  },
  archive: base.archive,
}
