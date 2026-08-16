import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, preamble } from './_db.js'

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
 *
 * **This route is public. Reading is open, writing is not.**
 *
 * It used to carry the token, and that made the source of truth unreadable to
 * anyone who had not been handed a secret: a visitor, a parent, a phone in private
 * browsing all opened an empty application rather than the club. Provisioning every
 * device that only ever reads is a cost with no matching benefit — the club's
 * schedule, standings and team message are not confidential.
 *
 * The consequence is stated rather than hidden: the payload carries the roster as
 * filed, licence numbers, birth dates and heights included, and it is readable by
 * anyone who knows the deployment's URL. `/api/match/:id` chooses the opposite
 * trade-off for the spectator page, where it projects number and name alone. Do not
 * deploy shared data you would mind seeing read.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return

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
