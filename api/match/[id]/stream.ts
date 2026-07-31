import { Redis } from '@upstash/redis'

/** Flux SSE (Server-Sent Events) : pousse le snapshot d'une rencontre aux
 * spectateurs dès qu'il change. Runtime Edge pour le streaming long. */
export const config = { runtime: 'edge' }

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

export default async function handler(req: Request): Promise<Response> {
  const m = new URL(req.url).pathname.match(/\/match\/([^/]+)\/stream/)
  const id = m?.[1]
  if (!redis) return new Response('Synchronisation non configurée', { status: 501 })
  if (!id) return new Response('id manquant', { status: 400 })

  const encoder = new TextEncoder()
  const key = `match:${id}`

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const close = () => { if (!closed) { closed = true; try { controller.close() } catch { /* déjà fermé */ } } }
      req.signal.addEventListener('abort', close)

      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      const comment = (c: string) => controller.enqueue(encoder.encode(`: ${c}\n\n`))

      let last = ''
      const started = Date.now()
      comment('ok')
      // Boucle de diffusion : ~1,5 s, max 5 min puis le client (EventSource) se reconnecte.
      while (!closed && Date.now() - started < 5 * 60 * 1000) {
        try {
          const data = await redis.get(key)
          const s = data ? JSON.stringify(data) : ''
          if (s && s !== last) { last = s; send(data) }
          else comment('ping')
        } catch { /* transitoire : on réessaie au tour suivant */ }
        await new Promise((r) => setTimeout(r, 1500))
      }
      close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    },
  })
}
