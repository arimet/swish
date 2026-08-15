import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Mounts the `api/` functions inside the dev server.
 *
 * Without this, `/api/*` only exists once deployed, and the synchronisation is
 * never exercised before production. The alternative — `vercel dev` — would impose
 * the Vercel CLI and a linked project on anyone who only wants to run the repo,
 * which is too expensive for a project we invite people to fork.
 *
 * Vercel handlers are ordinary `(req, res)` functions: all they need is what the
 * platform adds to Node, that is `query`, `body` and the `status`/`json`
 * shorthands. That is what this file does, and nothing more — a single code path
 * answers in development and in production.
 *
 * **The plugin only mounts if `DATABASE_URL` is present.** Without it, `pnpm dev`
 * behaves exactly as before: no API, no network call, the application is 100% local
 * with its demo dataset. That is what someone cloning the repo for the first time
 * should experience.
 */
export function devApi(): Plugin {
  return {
    name: 'swish-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      if (!process.env.DATABASE_URL) {
        server.config.logger.info('  ➜  API: off (DATABASE_URL absent) — 100% local mode')
        return
      }
      server.config.logger.info('  ➜  API: /api/* served from api/ (DATABASE_URL present)')

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const route = resolve(url.pathname)
        if (!route) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${route.file}`)
          await mod.default(await enrich(req, { ...route.params, ...query(url) }), decorate(res))
        } catch (e) {
          server.ssrFixStacktrace(e as Error)
          server.config.logger.error(`  ✖  /api${url.pathname.slice(4)}: ${(e as Error).message}`)
          if (!res.headersSent) res.statusCode = 500
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })
    },
  }
}

/** Vercel's routing, reduced to the project's four routes. The brackets in a file
 *  name become a parameter. */
function resolve(pathname: string): { file: string; params: Record<string, string> } | null {
  const p = pathname.replace(/^\/api\//, '').replace(/\/$/, '')
  if (p === 'state') return { file: 'state.ts', params: {} }
  if (p === 'mutate') return { file: 'mutate.ts', params: {} }
  const stream = p.match(/^match\/([^/]+)\/stream$/)
  if (stream) return { file: 'match/[id]/stream.ts', params: { id: decodeURIComponent(stream[1]) } }
  const one = p.match(/^match\/([^/]+)$/)
  if (one) return { file: 'match/[id].ts', params: { id: decodeURIComponent(one[1]) } }
  return null
}

const query = (url: URL) => Object.fromEntries(url.searchParams)

/** Vercel decodes the JSON body before calling the handler; Node does not. */
async function enrich(req: IncomingMessage, params: Record<string, string>) {
  const raw = await new Promise<string>((ok) => {
    let d = ''
    req.on('data', (c) => { d += c })
    req.on('end', () => ok(d))
  })
  let body: unknown
  try { body = raw ? JSON.parse(raw) : undefined } catch { body = raw }
  return Object.assign(req, { query: params, body, cookies: {} })
}

/** The shorthands Vercel adds to the response. */
function decorate(res: ServerResponse) {
  return Object.assign(res, {
    status(code: number) { res.statusCode = code; return this },
    json(v: unknown) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); return this },
    send(v: unknown) { res.end(typeof v === 'string' ? v : JSON.stringify(v)); return this },
  })
}
