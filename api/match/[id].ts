import type { VercelRequest, VercelResponse } from '@vercel/node'
import { preamble } from '../_db.js'
import { bundle } from '../_bundle.js'

/**
 * The spectator view of a game.
 *
 * **Public, and that is its whole point**: this link is shared with parents, who
 * have neither the application nor the club's token. Reading is open here as it is
 * on `docs.ts`, but this route projects far less: number and name, not the record.
 *
 * It is read-only: the bundle is projected out of the table (see `_bundle`), and
 * the game gets there through the scorer's own writes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'id missing' })

  const p = await bundle(id)
  if (!p) return res.status(404).json({ error: 'Game not found' })

  return res.status(200).json(p)
}
