import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool, prelude, refuse } from './_db.js'

/**
 * Hydratation du miroir local depuis la source de vérité.
 *
 * Renvoie deux choses, et la seconde est celle qu'on oublie :
 *
 * - `docs` — ce qui a bougé depuis `since`. Sans `since`, tout.
 * - `vivants` — les identifiants que la base détient **encore**. Le client
 *   supprime en local ce qui n'y figure pas.
 *
 * Le manifeste existe parce qu'une suppression supprime vraiment la ligne : il
 * n'y a donc aucune pierre tombale à transporter, et une hydratation
 * incrémentale ne peut pas décrire ce qui n'existe plus. L'absence le dit à sa
 * place — ce qui est plus robuste qu'une trace, puisque rien ne peut expirer ni
 * être manqué : un appareil resté six mois hors ligne se remet d'aplomb en une
 * hydratation.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (prelude(req, res, 'GET')) return
  if (refuse(req, res)) return

  const brut = Number(req.query.since)
  const since = Number.isFinite(brut) && brut > 0 ? brut : 0

  // Une seule requête pour les deux réponses : chaque ligne donne son identifiant
  // au manifeste, et son document seulement si elle a bougé depuis le curseur.
  const { rows } = await pool!.query<{ kind: string; id: string; rev: string; doc: unknown }>(
    `select kind, id, rev, case when rev > $1 then doc else null end as doc
       from documents
      order by rev`,
    [since],
  )

  let rev = since
  const docs: { kind: string; id: string; doc: unknown }[] = []
  const vivants: string[] = []
  for (const r of rows) {
    vivants.push(`${r.kind}:${r.id}`)
    rev = Math.max(rev, Number(r.rev))
    if (r.doc !== null) docs.push({ kind: r.kind, id: r.id, doc: r.doc })
  }

  return res.status(200).json({ rev, docs, vivants })
}
