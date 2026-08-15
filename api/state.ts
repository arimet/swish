import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble, unauthorized } from './_db.js'

/**
 * Hydration of the local mirror from the source of truth.
 *
 * Returns two things, and the second is the one people forget:
 *
 * - `docs` — what moved since `since`. Without `since`, everything.
 * - `alive` — the ids the database **still** holds. The client deletes locally
 *   whatever is not in it.
 *
 * The manifest exists because a deletion really removes the row: there is
 * therefore no tombstone to carry around, and an incremental hydration cannot
 * describe what no longer exists. Absence says it instead — which is sturdier than
 * a trace, since nothing can expire or be missed: a device left offline for six
 * months rights itself in one hydration.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return
  if (unauthorized(req, res)) return

  const raw = Number(req.query.since)
  const since = Number.isFinite(raw) && raw > 0 ? raw : 0

  // One query for both answers: every row gives its id to the manifest, and its
  // document only if it moved since the cursor.
  const { rows } = await pool!.query<{ kind: string; id: string; rev: string; doc: unknown }>(
    `select kind, id, rev, case when rev > $1 then doc else null end as doc
       from documents
      order by rev`,
    [since],
  )

  let rev = since
  const docs: { kind: string; id: string; doc: unknown }[] = []
  const alive: string[] = []
  for (const r of rows) {
    alive.push(`${r.kind}:${r.id}`)
    rev = Math.max(rev, Number(r.rev))
    if (r.doc !== null) docs.push({ kind: r.kind, id: r.id, doc: r.doc })
  }

  return res.status(200).json({ rev, docs, alive })
}
