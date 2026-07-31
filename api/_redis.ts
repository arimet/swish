import { Redis } from '@upstash/redis'

/** Client Redis (Upstash / Vercel KV). Null si les variables d'env sont absentes,
 * ce qui permet aux routes de répondre proprement « sync non configuré ». */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

export const redis = url && token ? new Redis({ url, token }) : null
export const keyOf = (id: string) => `match:${id}`
export const TTL_SECONDS = 60 * 60 * 12 // 12 h : nettoyage automatique après la rencontre
