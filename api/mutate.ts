import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble, unauthorized, KINDS } from './_db.js'

/**
 * Writing to the source of truth. There is no queue in front of this route and no
 * mirror behind it: the screen sends its document and only believes itself saved
 * once this answers.
 *
 * **Every kind is written the same way: the document that arrives replaces the one
 * stored**, the match sheet included. Merging its events instead — with retractions so
 * an undo could survive the union — only ever reconciles copies held on devices, and
 * there are no copies: a rule that runs on a state which cannot occur is a rule that
 * will one day be wrong for a reason nobody remembers.
 *
 * The consequence is worth knowing: a sheet is written whole, so **one game is kept by
 * one device**. The day two must record the same game, the fix is for this route to own
 * the event log and append to it, not for a merge to come back.
 *
 * The batch is a transaction, all or nothing. It is not there for offline catch-up —
 * it is there because a deletion cascades: erasing a team also erases its players,
 * its results, its sessions, its plays and its message, and half of that applied
 * would leave the club in a state no screen can describe.
 */

interface Op {
  kind?: string
  op?: 'put' | 'del'
  id?: string
  doc?: unknown
}

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
    if (!o.kind || !KINDS.has(o.kind)) return res.status(400).json({ error: `unknown kind: ${o.kind}` })
    if (o.op !== 'put' && o.op !== 'del') return res.status(400).json({ error: 'op must be put or del' })
    if (o.op === 'put' && (typeof o.doc !== 'object' || o.doc === null)) {
      return res.status(400).json({ error: 'doc missing' })
    }
  }

  const client = await pool!.connect()
  try {
    await client.query('begin')
    for (const o of ops) {
      if (o.op === 'del') {
        await client.query('delete from documents where kind = $1 and id = $2', [o.kind, o.id])
      } else {
        await client.query(
          `insert into documents (kind, id, doc) values ($1, $2, $3)
           on conflict (kind, id) do update set doc = excluded.doc`,
          [o.kind, o.id, o.doc],
        )
      }
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }

  return res.status(204).end()
}
