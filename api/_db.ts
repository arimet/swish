import { Pool } from 'pg'
import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * La source de vérité. `null` quand `DATABASE_URL` est absente, ce qui permet aux
 * routes de répondre proprement « synchronisation non configurée » — et c'est le
 * cas par défaut : sans base, l'application reste 100 % locale.
 *
 * `max: 1` : une fonction serverless n'a pas de connexion à garder entre deux
 * invocations, et Neon fait le vrai regroupement de son côté (utiliser son point
 * d'entrée mutualisé, celui dont l'hôte porte `-pooler`).
 */
const url = process.env.DATABASE_URL
export const pool = url ? new Pool({ connectionString: url, max: 1 }) : null

/**
 * Sans cet écouteur, une base qui redémarre **fait tomber le processus**.
 *
 * `pg.Pool` émet `error` quand une connexion inactive se rompt — coupure réseau,
 * redémarrage de la base, veille de Neon. En Node, un évènement `error` sans
 * écouteur devient une exception non rattrapée, donc un arrêt. Ce n'est pas
 * théorique : couper Postgres pendant une saisie a tué le serveur de
 * développement d'un coup, et une fonction Vercel mourrait pareil.
 *
 * Il n'y a rien à faire de cette erreur : la connexion est déjà retirée du groupe,
 * et la requête suivante en ouvrira une neuve. Ce qu'il faut, c'est qu'elle ne
 * soit pas fatale.
 */
pool?.on('error', (e) => { console.error('[swish] connexion Postgres perdue :', e.message) })

/** Le jeton d'écriture. **Pas** de préfixe `VITE_` : il ne doit jamais entrer
 *  dans le bundle, contrairement aux trois codes d'accès qui, eux, sont lisibles
 *  dans les outils du navigateur. C'est toute la différence entre une porte que
 *  le client s'ouvre lui-même et une porte gardée par le serveur. */
const TOKEN = process.env.SYNC_WRITE_TOKEN ?? ''

/** Comparaison à durée constante : une comparaison naïve fuit la longueur du
 *  préfixe correct, donc le jeton, un caractère à la fois. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Garde les routes qui touchent aux données du club — l'écriture, mais aussi
 * l'hydratation : l'effectif porte des noms, des dates de naissance et des
 * tailles de joueurs parfois mineurs, et ça n'a pas à être public.
 *
 * Renvoie `true` quand la requête peut continuer ; sinon la réponse est déjà
 * écrite et l'appelant n'a plus qu'à sortir.
 */
export function unauthorized(req: VercelRequest, res: VercelResponse): boolean {
  if (!TOKEN) {
    // Une base configurée sans jeton serait ouverte à qui connaît l'URL. On
    // refuse de démarrer dans cet état plutôt que de le laisser passer en silence.
    res.status(503).json({ error: 'SYNC_WRITE_TOKEN manquant côté serveur' })
    return true
  }
  const fourni = req.headers['x-swish-token']
  if (typeof fourni !== 'string' || !sameSecret(fourni, TOKEN)) {
    res.status(401).json({ error: 'Jeton invalide' })
    return true
  }
  return false
}

/** Le préambule commun : CORS, pré-vol, base configurée. Renvoie `true` quand la
 *  réponse est déjà écrite. */
export function preamble(req: VercelRequest, res: VercelResponse, methodes: string): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', `${methodes}, OPTIONS`)
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-swish-token')
  if (req.method === 'OPTIONS') { res.status(204).end(); return true }
  if (!pool) { res.status(501).json({ error: 'Synchronisation non configurée' }); return true }
  if (!methodes.split(', ').includes(req.method ?? '')) {
    res.setHeader('Allow', `${methodes}, OPTIONS`)
    res.status(405).end()
    return true
  }
  return false
}
