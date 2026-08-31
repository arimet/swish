import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble, KINDS } from './_db.js'

/**
 * Reading the source of truth. One kind at a time, optionally one document.
 *
 *   GET /api/docs?kind=team          → every team, as an array of documents
 *   GET /api/docs?kind=match&id=xyz  → that game, or 404
 *
 * The documents carry their own key (`id`, or `matchId` for a call-up, `clubId` for
 * the coach's message), so there is nothing to wrap them in.
 *
 * **This route is public. Reading is open, writing is not.**
 *
 * A token here would make the source of truth unreadable to anyone who has not been
 * handed a secret: a visitor, a parent, a phone in private browsing would each open an
 * empty application rather than the club. Provisioning every device that only ever
 * reads is a cost with no matching benefit — the club's schedule, standings and team
 * message are not confidential.
 *
 * The consequence is stated rather than hidden: `kind=player` returns the roster as
 * filed, licence numbers, birth dates and heights included, and it is readable by
 * anyone who knows the deployment's URL. `/api/match/:id` chooses the opposite
 * trade-off for the spectator page, where it projects number and name alone. Do not
 * deploy data you would mind seeing read.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return

  const kind = req.query.kind
  if (typeof kind !== 'string' || !KINDS.has(kind)) {
    return res.status(400).json({ error: 'unknown kind' })
  }
  const id = typeof req.query.id === 'string' ? req.query.id : null

  // The screens read on every mount and expect the current state: a cached answer
  // would show a scorer the roster from before their own correction.
  res.setHeader('cache-control', 'no-store')

  if (id) {
    const { rows } = await pool!.query<{ doc: unknown }>(
      'select doc from documents where kind = $1 and id = $2', [kind, id])
    if (!rows.length) return res.status(404).json({ error: 'not found' })
    return res.status(200).json(rows[0].doc)
  }

  const { rows } = await pool!.query<{ doc: unknown }>(
    'select doc from documents where kind = $1', [kind])
  return res.status(200).json(rows.map((r) => r.doc))
}
