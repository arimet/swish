import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PoolClient } from 'pg'
import { pool, preamble, unauthorized } from './_db.js'
import { mergeMatches } from '../src/domain/merge.js'
import type { Match } from '../src/domain/types.js'

/**
 * A match sheet is not overwritten, it is merged.
 *
 * It is the one document that escapes "most recent wins", and not as a convenience
 * exception: when two devices record the same game, the loser of the arbitration
 * is not wrong — it noted other events. Overwriting them would make baskets
 * disappear, which this product considers its worst category of defect.
 *
 * Arbitration therefore keeps its role, but only over what replaces (`meta`,
 * `roster`): the winner goes second into `mergeMatches`, whose field spread makes
 * it win. The events, for their part, unite whichever it is.
 */
async function writeMatch(client: PoolClient, id: string, incoming: Match, when: Date) {
  // `for update` locks the row for the duration of the transaction: without it, two
  // simultaneous sends would read the same state and the second would overwrite the
  // first one's merge — precisely the scenario this function exists to prevent.
  const { rows } = await client.query<{ doc: Match; modified_at: Date }>(
    "select doc, modified_at from documents where kind = 'match' and id = $1 for update", [id])

  if (!rows.length) {
    await client.query(
      `insert into documents (kind, id, doc, modified_at, rev)
       values ('match', $1, $2, $3, nextval('documents_rev'))`,
      [id, incoming, when])
    return
  }

  const stored = rows[0].doc
  const incomingWins = when > rows[0].modified_at
  const merged = incomingWins
    ? mergeMatches(stored, incoming)
    : mergeMatches(incoming, stored)

  await client.query(
    `update documents
        set doc = $2, modified_at = greatest(modified_at, $3), rev = nextval('documents_rev')
      where kind = 'match' and id = $1`,
    [id, merged, when])
}

/**
 * The key every writer agrees on. Its value means nothing — only that it is the
 * same one everywhere, so that two sends contend for it. See `begin` below.
 */
const REV_LOCK = 8_246_733

/** The kinds the database accepts. An operation of an unknown kind is ignored
 *  rather than rejected: a device left on a newer version must not have its whole
 *  queue turned away over a single item. */
const KINDS = new Set(['team', 'player', 'match', 'result', 'convocation', 'training', 'play', 'message'])

interface Op {
  kind?: string
  op?: 'put' | 'del'
  id?: string
  doc?: unknown
  /** When the person made the change, on their device. See below. */
  modifiedAt?: string
}

/**
 * Writes coming from a device's queue.
 *
 * **The most recent modification wins — the most recently *made*, not the most
 * recently *received*.** The whole logic sits in the two `where` clauses below, and
 * they exist for the following scenario:
 *
 *   The scorer corrects the venue at 2pm, with no network.
 *   The coach corrects the same field at 3pm, online: it leaves right away.
 *   The scorer gets coverage back at 4pm and their queue empties.
 *
 * Arbitrating on arrival would let the scorer win, whose entry is two hours behind.
 * `modified_at` is therefore stamped by the device at the moment of the gesture.
 *
 * The trade-off is accepted: we trust phone clocks. The usual drift is counted in
 * seconds, the lateness we are correcting in hours.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'POST')) return
  if (unauthorized(req, res)) return

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const ops: Op[] = body?.ops
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'ops missing' })

  const client = await pool!.connect()
  try {
    // A batch is all or nothing: a half-applied queue would leave the client
    // believing its send lost, and replaying on top of a half-updated state.
    await client.query('begin')

    /*
     * Writes are serialised, and this is not a precaution — it is what makes the
     * hydration cursor tell the truth.
     *
     * `rev` is handed out by `nextval` at the moment of the *statement*, while a
     * reader only ever sees *committed* rows. Those two orders are not the same one,
     * and hydration reads "what is above my cursor":
     *
     *   Send A takes rev 10 and is still committing.
     *   Send B takes rev 11 and commits first.
     *   A phone hydrates: it sees 11, and files 11 as its cursor.
     *   A commits. Its rev 10 now sits *below* that cursor — `rev > since` will never
     *   match it again, on that device, ever.
     *
     * The write is in the database and `alive` even names its id, so the sweep for the
     * dead keeps the phone's stale copy rather than dropping it: the divergence is
     * silent, and no amount of refreshing repairs it. That is how the source of truth
     * comes to hold a message a second phone cannot see.
     *
     * Holding one lock for the length of a batch makes assignment order and commit
     * order the same order, so what is committed is always a *prefix* of what has been
     * handed out — and a cursor cannot step over a write it has not been given. The
     * lock is released by the commit or the rollback below, whichever comes.
     *
     * The cost is that two devices sending at the same instant queue up. A batch is a
     * handful of statements against an indexed primary key, and a club is a handful of
     * phones: this is the cheap side of the trade.
     *
     * The timeout puts a floor under the bad case. Whatever holds the lock for five
     * seconds is not a batch about to land, and waiting behind it pins a connection
     * for nothing. Giving up raises, hence rolls back, hence answers 500 — which is
     * exactly what the queue is built for: it keeps its items and leaves again later.
     */
    await client.query("set local lock_timeout = '5s'")
    await client.query('select pg_advisory_xact_lock($1)', [REV_LOCK])
    for (const o of ops) {
      if (!o?.id || !o.kind || !KINDS.has(o.kind)) continue
      const when = o.modifiedAt ? new Date(o.modifiedAt) : null
      if (!when || Number.isNaN(when.getTime())) continue

      if (o.op === 'put' && o.doc !== undefined && o.kind === 'match') {
        await writeMatch(client, o.id, o.doc as Match, when)
      } else if (o.op === 'put' && o.doc !== undefined) {
        await client.query(
          `insert into documents (kind, id, doc, modified_at, rev)
           values ($1, $2, $3, $4, nextval('documents_rev'))
           on conflict (kind, id) do update
              set doc = excluded.doc,
                  modified_at = excluded.modified_at,
                  rev = nextval('documents_rev')
            where excluded.modified_at > documents.modified_at`,
          [o.kind, o.id, o.doc, when],
        )
      } else if (o.op === 'del') {
        // A deletion is arbitrated like the rest: a deletion decided at 2pm does not
        // carry off a modification made at 3pm on another device.
        await client.query(
          'delete from documents where kind = $1 and id = $2 and modified_at < $3',
          [o.kind, o.id, when],
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
