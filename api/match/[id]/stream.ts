import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool } from '../../_db.js'
import { paquet } from '../../_bundle.js'

/**
 * Flux SSE : pousse le paquet d'une rencontre aux spectateurs dès qu'il change.
 *
 * Le runtime passe d'Edge à Node, parce que Postgres se parle en TCP et que le
 * runtime Edge ne l'ouvre pas. Conséquence : la boucle ne peut plus tenir cinq
 * minutes — une fonction Vercel a une durée bornée — donc on tient cinquante
 * secondes et on laisse `EventSource` se reconnecter, ce qu'il fait tout seul.
 * Le client garde de toute façon son repli en interrogation périodique.
 */
export const config = { maxDuration: 60 }

const DUREE_MS = 50_000
const PAS_MS = 1500

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!pool) return res.status(501).end('Synchronisation non configurée')

  const id = req.query.id as string
  if (!id) return res.status(400).end('id manquant')

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  })

  let ouvert = true
  req.on('close', () => { ouvert = false })

  // On n'émet que sur changement réel : `rev` est un numéro d'écriture, donc
  // comparer deux entiers suffit — pas besoin de sérialiser le paquet pour savoir
  // s'il a bougé.
  let dernier = -1
  res.write(': ok\n\n')

  const debut = Date.now()
  while (ouvert && Date.now() - debut < DUREE_MS) {
    try {
      const p = await paquet(id)
      if (p && p.rev !== dernier) {
        dernier = p.rev
        res.write(`data: ${JSON.stringify(p)}\n\n`)
      } else {
        res.write(': ping\n\n')
      }
    } catch { /* transitoire : on réessaie au tour suivant */ }
    await new Promise((r) => setTimeout(r, PAS_MS))
  }

  res.end()
}
