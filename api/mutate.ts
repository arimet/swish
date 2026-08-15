import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PoolClient } from 'pg'
import { pool, preamble, unauthorized } from './_db.js'
import { mergeMatches } from '../src/domain/fusion.js'
import type { Match } from '../src/domain/types.js'

/**
 * La feuille de match ne s'écrase pas, elle se fusionne.
 *
 * C'est le seul document qui échappe à « la plus récente gagne », et ce n'est pas
 * une exception de confort : quand deux appareils saisissent la même rencontre,
 * le perdant de l'arbitrage n'a pas tort — il a noté d'autres évènements. Les
 * écraser reviendrait à faire disparaître des paniers, ce que ce produit
 * considère comme sa pire catégorie de défaut.
 *
 * L'arbitrage garde donc son rôle, mais seulement sur ce qui se remplace
 * (`meta`, `roster`) : le vainqueur passe en second à `fusionnerMatchs`, dont
 * l'étalement des champs le fait gagner. Les évènements, eux, s'unissent quel
 * qu'il soit.
 */
async function writeMatch(client: PoolClient, id: string, incoming: Match, when: Date) {
  // `for update` verrouille la ligne le temps de la transaction : sans lui, deux
  // envois simultanés liraient le même état et le second écraserait la fusion du
  // premier — précisément le scénario que cette fonction existe pour empêcher.
  const { rows } = await client.query<{ doc: Match; modified_at: Date }>(
    "select doc, modified_at from documents where kind = 'match' and id = $1 for update", [id])

  if (!rows.length) {
    await client.query(
      `insert into documents (kind, id, doc, modified_at, rev)
       values ('match', $1, $2, $3, nextval('documents_rev'))`,
      [id, incoming, when])
    return
  }

  const stored = rows[0].doc
  const incomingWins = when > rows[0].modified_at
  const merged = incomingWins
    ? mergeMatches(stored, incoming)
    : mergeMatches(incoming, stored)

  await client.query(
    `update documents
        set doc = $2, modified_at = greatest(modified_at, $3), rev = nextval('documents_rev')
      where kind = 'match' and id = $1`,
    [id, merged, when])
}

/** Les genres que la base accepte. Une opération d'un genre inconnu est ignorée
 *  plutôt que refusée : un appareil resté sur une version plus récente ne doit
 *  pas voir toute sa file rejetée pour un seul élément. */
const GENRES = new Set(['team', 'player', 'match', 'result', 'convocation', 'training', 'play', 'message'])

interface Op {
  kind?: string
  op?: 'put' | 'del'
  id?: string
  doc?: unknown
  /** Quand la personne a modifié, sur son appareil. Voir plus bas. */
  modifiedAt?: string
}

/**
 * Écritures venues de la file d'attente d'un appareil.
 *
 * **La modification la plus récente gagne — la plus récemment faite, pas la plus
 * récemment reçue.** Toute la logique tient dans les deux clauses `where`
 * ci-dessous, et elles existent pour le scénario suivant :
 *
 *   Le marqueur corrige le lieu à 14 h, sans réseau.
 *   Le coach corrige le même champ à 15 h, en ligne : ça part tout de suite.
 *   Le marqueur retrouve du réseau à 16 h et sa file se vide.
 *
 * Arbitrer sur l'arrivée ferait gagner le marqueur, dont la saisie a deux heures
 * de retard. `modified_at` est donc posé par l'appareil au moment du geste.
 *
 * La contrepartie est assumée : on fait confiance à l'horloge des téléphones. Le
 * décalage courant se compte en secondes, le retard qu'on corrige en heures.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'POST')) return
  if (unauthorized(req, res)) return

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const ops: Op[] = body?.ops
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'ops manquant' })

  const client = await pool!.connect()
  try {
    // Un lot est tout ou rien : une file à moitié appliquée laisserait le client
    // croire son envoi perdu et rejouer par-dessus un état déjà à moitié à jour.
    await client.query('begin')
    for (const o of ops) {
      if (!o?.id || !o.kind || !GENRES.has(o.kind)) continue
      const when = o.modifiedAt ? new Date(o.modifiedAt) : null
      if (!when || Number.isNaN(when.getTime())) continue

      if (o.op === 'put' && o.doc !== undefined && o.kind === 'match') {
        await writeMatch(client, o.id, o.doc as Match, when)
      } else if (o.op === 'put' && o.doc !== undefined) {
        await client.query(
          `insert into documents (kind, id, doc, modified_at, rev)
           values ($1, $2, $3, $4, nextval('documents_rev'))
           on conflict (kind, id) do update
              set doc = excluded.doc,
                  modified_at = excluded.modified_at,
                  rev = nextval('documents_rev')
            where excluded.modified_at > documents.modified_at`,
          [o.kind, o.id, o.doc, when],
        )
      } else if (o.op === 'del') {
        // La suppression s'arbitre comme le reste : une suppression décidée à 14 h
        // n'emporte pas une modification faite à 15 h sur un autre appareil.
        await client.query(
          'delete from documents where kind = $1 and id = $2 and modified_at < $3',
          [o.kind, o.id, when],
        )
      }
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }

  return res.status(204).end()
}
