import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble } from './_db.js'

/**
 * The keepalive.
 *
 *   GET /api/ping → { ok: true, rows: 0 | 1 }
 *
 * A managed database that nobody queries for thirty days is treated as abandoned and
 * removed. That is the ordinary state of this application out of season: a club stops
 * playing in June, opens Swish again in September, and between the two nothing has
 * touched the database — the deletion would be entirely legitimate and entirely fatal.
 *
 * So `vercel.json` calls this route once a day. It reads one row from `documents`
 * rather than answering `select 1`: the point is to prove the **data** is still in use,
 * not that a connection can be opened, and a query that never touches the table is a
 * keepalive that might not count as one.
 *
 * Public and unauthenticated, like every other read (see the note in `docs.ts`). It
 * discloses nothing — the row is counted, never returned — and the cost of someone
 * calling it is one index-free lookup on a table of a few thousand rows.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return
  const { rowCount } = await pool!.query('select 1 from documents limit 1')
  res.status(200).json({ ok: true, rows: rowCount })
}
