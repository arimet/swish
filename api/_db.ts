import { Pool } from 'pg'
import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * The source of truth. There is no fallback: without a database the application has
 * nothing to read and nowhere to write, so the routes answer 500 rather than pretend.
 *
 * **The functions must run beside it.** Neon holds the club in `eu-west-2` (London);
 * left to itself Vercel runs the functions in `iad1` (Washington), so every query
 * crossed the Atlantic twice. That was measured, not guessed: 300 to 500 ms for a read
 * of six kilobytes, on pages that read four to seven documents on mount — the whole of
 * the "the data takes a while to load" this fixed. `vercel.json` pins `lhr1`, which is
 * the same building as `eu-west-2`. **Move the database and that line moves with it**,
 * or the latency comes straight back with nothing on screen to explain it.
 *
 * `max: 1`: a serverless function has no connection to keep between two
 * invocations, and Neon does the real pooling on its side (use its shared entry
 * point, the one whose host carries `-pooler`).
 */
const url = process.env.DATABASE_URL
export const pool = url ? new Pool({ connectionString: url, max: 1 }) : null

/**
 * Without this listener, a database that restarts **takes the process down**.
 *
 * `pg.Pool` emits `error` when an idle connection breaks — network cut, database
 * restart, Neon going to sleep. In Node, an `error` event with no listener becomes
 * an uncaught exception, hence a shutdown. This is not theoretical: stopping
 * Postgres during data entry killed the dev server outright, and a Vercel function
 * would die the same way.
 *
 * There is nothing to do about this error: the connection is already out of the
 * pool, and the next query will open a fresh one. What matters is that it is not
 * fatal.
 */
pool?.on('error', (e) => { console.error('[swish] Postgres connection lost:', e.message) })

/** The kinds the database accepts. Both routes check against this list: an unknown
 *  kind is a client bug or a probe, never a document to store. */
export const KINDS = new Set(['team', 'player', 'match', 'result', 'convocation', 'training', 'play', 'message'])

/** The write token. **No** `VITE_` prefix: it must never enter the bundle, unlike
 *  the three access codes, which are readable in the browser's tools. That is the
 *  whole difference between a door the client opens for itself and a door guarded
 *  by the server. */
const TOKEN = process.env.WRITE_TOKEN ?? ''

/** Constant-time comparison: a naive one leaks the length of the correct prefix,
 *  hence the token, one character at a time. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Guards the routes that **write** club data. Reading is open — see the note at the
 * top of `docs.ts`.
 *
 * So this is the only door, which puts more weight on it, not less: an unguarded
 * `/api/mutate` would let anyone who knows the URL rewrite a match sheet.
 *
 * Returns `true` when the response is already written and the caller only has to
 * return.
 */
export function unauthorized(req: VercelRequest, res: VercelResponse): boolean {
  if (!TOKEN) {
    // A database configured without a token would be open to anyone who knows the
    // URL. We refuse to start in that state rather than let it pass in silence.
    res.status(503).json({ error: 'WRITE_TOKEN missing server-side' })
    return true
  }
  const supplied = req.headers['x-swish-token']
  if (typeof supplied !== 'string' || !sameSecret(supplied, TOKEN)) {
    res.status(401).json({ error: 'Invalid token' })
    return true
  }
  return false
}

/** The common preamble: CORS, preflight, database reachable, method allowed.
 *  Returns `true` when the response is already written. */
export function preamble(req: VercelRequest, res: VercelResponse, methods: string): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`)
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-swish-token')
  if (req.method === 'OPTIONS') { res.status(204).end(); return true }
  if (!pool) { res.status(500).json({ error: 'DATABASE_URL missing server-side' }); return true }
  if (!methods.split(', ').includes(req.method ?? '')) {
    res.setHeader('Allow', `${methods}, OPTIONS`)
    res.status(405).end()
    return true
  }
  return false
}
