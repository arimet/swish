import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, keyOf, TTL_SECONDS } from '../_redis.js'

/** Snapshot d'une rencontre pour le suivi spectateur.
 * GET  → renvoie le « bundle » publié (match + joueurs + noms d'équipe).
 * PUT  → la table de marque publie l'état courant (best-effort, offline-first). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!redis) return res.status(501).json({ error: 'Synchronisation non configurée' })
  if (!id) return res.status(400).json({ error: 'id manquant' })

  if (req.method === 'GET') {
    const data = await redis.get(keyOf(id))
    if (!data) return res.status(404).json({ error: 'Rencontre introuvable' })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'corps invalide' })
    await redis.set(keyOf(id), body, { ex: TTL_SECONDS })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, OPTIONS')
  return res.status(405).end()
}
