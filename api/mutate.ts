/**
 * Writing to the source of truth. There is no queue in front of this route and no
 * mirror behind it: the screen sends its document and only believes itself saved
 * once this answers.
 *
 * A `put` writes the document's rows; a `del` **archives** — nothing is ever deleted,
 * and the `active_*` views hide what hangs off an archived row. A game's `put` writes
 * its meta, status and roster, never its events: those go through
 * `/api/match/:id/events`, one at a time.
 *
 * The batch is a transaction, all or nothing. A constraint the batch breaks — a player
 * on a team that does not exist — answers `400` with the constraint's name, and
 * nothing of the batch is kept.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble, unauthorized, isKind } from './_db.js'
import { store } from './_rows/index.js'
import { BadRequest, constraintOf } from './_rows/db.js'

interface Op { kind?: string; op?: 'put' | 'del'; id?: string; doc?: unknown }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'POST')) return
  if (unauthorized(req, res)) return

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const ops: Op[] = body?.ops
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'ops missing' })

  // Validated before the transaction opens, so a malformed batch costs no lock and
  // reaches nothing. An unknown kind is refused rather than skipped: there is no
  // longer a queue of mixed versions to spare — the client and this route ship
  // together.
  for (const o of ops) {
    if (!o?.id || typeof o.id !== 'string') return res.status(400).json({ error: 'id missing' })
    if (!isKind(o.kind)) return res.status(400).json({ error: `unknown kind: ${o.kind}` })
    if (o.op !== 'put' && o.op !== 'del') return res.status(400).json({ error: 'op must be put or del' })
    if (o.op === 'put' && (typeof o.doc !== 'object' || o.doc === null)) return res.status(400).json({ error: 'doc missing' })
    // A tab opened before the move to per-event writes still sends whole sheets:
    // refusing them makes its saves fail visibly instead of silently dropping events.
    const events = (o.doc as { events?: unknown } | undefined)?.events
    if (o.op === 'put' && o.kind === 'match' && Array.isArray(events) && events.length) {
      return res.status(400).json({ error: 'a game\'s events go through /api/match/:id/events' })
    }
  }

  const client = await pool!.connect()
  try {
    await client.query('begin')
    for (const o of ops) {
      const s = store(o.kind as never)
      if (o.op === 'del') await s.archive(client, o.id!)
      else await s.put(client, o.id!, o.doc)
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    const refused = e instanceof BadRequest ? e.message : constraintOf(e)
    if (refused) return res.status(400).json({ error: refused })
    throw e
  } finally {
    client.release()
  }

  return res.status(204).end()
}
