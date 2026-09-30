import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble, unauthorized } from '../../_db.js'
import { writeEvents } from '../../_rows/events.js'
import { BadRequest, constraintOf } from '../../_rows/db.js'
import type { GameEvent } from '../../../src/domain/types.js'

/**
 * A game's events, one batch at a time: `{ add: GameEvent[], archive: string[],
 * before?: { [addedId]: anchorId } }` — `before` puts an added event ahead of an
 * existing one instead of at the end.
 *
 * This is what lets two devices keep one game. The sheet is no longer written whole,
 * so a tap on the bench cannot overwrite a tap at the table: each adds its own row,
 * and each undo archives one. A trigger bumps the game's `rev`, which is what the live
 * stream watches.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'POST')) return
  if (unauthorized(req, res)) return

  const id = req.query.id as string
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const add: GameEvent[] = body?.add ?? []
  const archive: string[] = body?.archive ?? []
  const before: Record<string, string> = body?.before ?? {}
  if (!id || !Array.isArray(add) || !Array.isArray(archive)) return res.status(400).json({ error: 'add and archive must be arrays' })
  if (typeof before !== 'object' || Array.isArray(before) || Object.values(before).some((x) => typeof x !== 'string')) {
    return res.status(400).json({ error: 'before must map ids to ids' })
  }
  if (add.some((e) => typeof e?.id !== 'string' || typeof e?.type !== 'string') || archive.some((x) => typeof x !== 'string')) {
    return res.status(400).json({ error: 'malformed event' })
  }

  const client = await pool!.connect()
  try {
    await client.query('begin')
    await writeEvents(client, id, add, archive, before)
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
