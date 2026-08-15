import type { VercelRequest, VercelResponse } from '@vercel/node'
import { preamble } from '../_db.js'
import { bundle } from '../_bundle.js'

/**
 * The spectator view of a game.
 *
 * **Public, and that is its whole point**: this link is shared with parents, who
 * have neither the application nor the club's token. It is the one route that does
 * not go through `_db.unauthorized`.
 *
 * There is no `PUT` any more: the bundle is derived from the table (see
 * `_bundle`), and the game already arrives there through the scorer's table queue.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'id missing' })

  const p = await bundle(id)
  if (!p) return res.status(404).json({ error: 'Game not found' })

  return res.status(200).json(p)
}
