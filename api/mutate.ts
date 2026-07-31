import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from './_redis.js'

/** Applique des mutations d'entités partagées (upsert/suppression).
 * Accepte un lot d'opérations (vidage de la file d'attente offline). */
const KEY: Record<string, string> = { team: 'swish:teams', player: 'swish:players', match: 'swish:matches' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!redis) return res.status(501).json({ error: 'Synchronisation non configurée' })
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return res.status(405).end() }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const ops = body?.ops
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'ops manquant' })

  for (const o of ops) {
    const key = KEY[o?.kind]
    if (!key || !o?.id) continue
    if (o.op === 'put' && o.doc !== undefined) await redis.hset(key, { [o.id]: o.doc })
    else if (o.op === 'del') await redis.hdel(key, o.id)
  }
  return res.status(204).end()
}
