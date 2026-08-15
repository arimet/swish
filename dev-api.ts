import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Monte les fonctions d'`api/` dans le serveur de développement.
 *
 * Sans ça, `/api/*` n'existe qu'une fois déployé, et la synchronisation ne se
 * teste jamais avant la production. L'alternative — `vercel dev` — imposerait le
 * CLI Vercel et un projet lié à quiconque veut seulement lancer le dépôt, ce qui
 * est trop cher pour un projet qu'on invite à forker.
 *
 * Les gestionnaires Vercel sont des fonctions `(req, res)` ordinaires : il suffit
 * de leur donner ce que la plateforme ajoute à Node, c'est-à-dire `query`, `body`
 * et les raccourcis `status`/`json`. C'est ce que fait ce fichier, et rien de plus
 * — un seul chemin de code répond en développement et en production.
 *
 * **Le plugin ne se monte que si `DATABASE_URL` est présente.** Sans elle, `pnpm
 * dev` se comporte exactement comme avant : aucune API, aucun appel réseau,
 * l'application est 100 % locale avec son jeu de données de démonstration. C'est
 * ce que doit vivre quelqu'un qui clone le dépôt pour la première fois.
 */
export function devApi(): Plugin {
  return {
    name: 'swish-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      if (!process.env.DATABASE_URL) {
        server.config.logger.info('  ➜  API : hors service (DATABASE_URL absente) — mode 100 % local')
        return
      }
      server.config.logger.info('  ➜  API : /api/* servi depuis api/ (DATABASE_URL présente)')

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
          server.config.logger.error(`  ✖  /api${url.pathname.slice(4)} : ${(e as Error).message}`)
          if (!res.headersSent) res.statusCode = 500
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })
    },
  }
}

/** Le routage de Vercel, réduit aux quatre routes du projet. Les crochets d'un
 *  nom de fichier deviennent un paramètre. */
function resolve(chemin: string): { file: string; params: Record<string, string> } | null {
  const p = chemin.replace(/^\/api\//, '').replace(/\/$/, '')
  if (p === 'state') return { file: 'state.ts', params: {} }
  if (p === 'mutate') return { file: 'mutate.ts', params: {} }
  const stream = p.match(/^match\/([^/]+)\/stream$/)
  if (stream) return { file: 'match/[id]/stream.ts', params: { id: decodeURIComponent(stream[1]) } }
  const un = p.match(/^match\/([^/]+)$/)
  if (un) return { file: 'match/[id].ts', params: { id: decodeURIComponent(un[1]) } }
  return null
}

const query = (url: URL) => Object.fromEntries(url.searchParams)

/** Vercel décode le corps JSON avant d'appeler le gestionnaire ; Node, non. */
async function enrich(req: IncomingMessage, params: Record<string, string>) {
  const brut = await new Promise<string>((ok) => {
    let d = ''
    req.on('data', (c) => { d += c })
    req.on('end', () => ok(d))
  })
  let body: unknown
  try { body = brut ? JSON.parse(brut) : undefined } catch { body = brut }
  return Object.assign(req, { query: params, body, cookies: {} })
}

/** Les raccourcis que Vercel ajoute à la réponse. */
function decorate(res: ServerResponse) {
  return Object.assign(res, {
    status(code: number) { res.statusCode = code; return this },
    json(v: unknown) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); return this },
    send(v: unknown) { res.end(typeof v === 'string' ? v : JSON.stringify(v)); return this },
  })
}
