import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool } from '../../_db.js'
import { bundle } from '../../_bundle.js'

/**
 * SSE stream: pushes a game's bundle to spectators as soon as it changes.
 *
 * The runtime is Node, because Postgres is spoken over TCP and the Edge runtime does
 * not open one. Consequence: the loop cannot hold five minutes — a Vercel function
 * has a bounded duration — so we hold fifty seconds and let `EventSource` reconnect,
 * which it does on its own. The client keeps its polling fallback in any case.
 */
export const config = { maxDuration: 60 }

const WINDOW_MS = 50_000
const STEP_MS = 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!pool) return res.status(500).end('DATABASE_URL missing server-side')

  const id = req.query.id as string
  if (!id) return res.status(400).end('id missing')

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  })

  let open = true
  req.on('close', () => { open = false })

  // We read the game's `rev` and nothing else, every second: one indexed lookup of a
  // number. Only when it moves — an event added or archived, the game rewritten — is
  // the bundle built and sent. Building it every turn cost three queries and a
  // serialisation per viewer per second and a half, to find out nothing had changed.
  let last: string | null = null
  res.write(': ok\n\n')

  const start = Date.now()
  while (open && Date.now() - start < WINDOW_MS) {
    try {
      const { rows } = await pool.query<{ rev: string }>('select rev from matches where id = $1', [id])
      const rev = rows[0]?.rev ?? null
      if (rev !== null && rev !== last) {
        const p = await bundle(id)
        if (p) { res.write(`data: ${JSON.stringify(p)}\n\n`); last = rev }
      } else {
        res.write(': ping\n\n')
      }
    } catch { /* transient: we retry on the next turn */ }
    await new Promise((r) => setTimeout(r, STEP_MS))
  }

  res.end()
}
