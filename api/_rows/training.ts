import type { Training } from '../../src/domain/types.js'
import { compact, tableStore, type Db, type Store } from './db.js'

interface Row { id: string; club_id: string; date: string; time: string | null; place: string | null; theme: string | null }

export const toRow = (t: Training): Row => ({
  id: t.id, club_id: t.clubId, date: t.date, time: t.time ?? null, place: t.place ?? null, theme: t.theme ?? null,
})
/** `playIds` is left out when empty, as the domain writes a session with no play. */
export const fromRow = (r: Row, playIds: string[]): Training => compact({
  id: r.id, clubId: r.club_id, date: r.date, time: r.time, place: r.place, theme: r.theme,
  playIds: playIds.length ? playIds : null,
})

const base = tableStore<Row, Row>({
  table: 'trainings', view: 'active_trainings', key: 'id',
  columns: ['id', 'club_id', 'date', 'time', 'place', 'theme'], toRow: (r) => r, fromRow: (r) => r,
})

/** The plays each session cites, archived plays left out: that is what used to be the
 *  client-side pruning on every play deletion. */
async function links(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ training_id: string; play_id: string }>(
    `select l.training_id, l.play_id from training_plays l join active_plays p on p.id = l.play_id
     where l.training_id = any($1::text[]) order by l.training_id, l.rank`, [ids])
  const out = new Map<string, string[]>()
  for (const r of rows) out.set(r.training_id, [...(out.get(r.training_id) ?? []), r.play_id])
  return out
}

export const trainings: Store<Training> = {
  async list(db) {
    const rows = await base.list(db)
    const l = await links(db, rows.map((r) => r.id))
    return rows.map((r) => fromRow(r, l.get(r.id) ?? []))
  },
  async get(db, id) {
    const row = await base.get(db, id)
    return row ? fromRow(row, (await links(db, [id])).get(id) ?? []) : null
  },
  async put(db, id, t) {
    await base.put(db, id, toRow({ ...t, id }))
    await db.query('delete from training_plays where training_id = $1', [id])
    for (const [rank, playId] of (t.playIds ?? []).entries()) {
      await db.query('insert into training_plays (training_id, play_id, rank) values ($1, $2, $3)', [id, playId, rank])
    }
  },
  archive: base.archive,
}
