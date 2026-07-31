import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from './_redis'

/** Snapshot des données partagées (source de vérité multi-machine) :
 * équipes, joueurs et matchs. Consommé au démarrage pour hydrater le cache local. */
const K = { team: 'swish:teams', player: 'swish:players', match: 'swish:matches' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!redis) return res.status(501).json({ error: 'Synchronisation non configurée' })
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); return res.status(405).end() }

  const [teams, players, matches] = await Promise.all([
    redis.hgetall(K.team), redis.hgetall(K.player), redis.hgetall(K.match),
  ])
  return res.status(200).json({
    teams: Object.values(teams ?? {}),
    players: Object.values(players ?? {}),
    matches: Object.values(matches ?? {}),
  })
}
