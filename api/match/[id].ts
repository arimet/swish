import type { VercelRequest, VercelResponse } from '@vercel/node'
import { preamble } from '../_db.js'
import { bundle } from '../_bundle.js'

/**
 * Le suivi spectateur d'une rencontre.
 *
 * **Publique, et c'est sa raison d'être** : on partage ce lien à des parents, qui
 * n'ont ni l'application ni le jeton du club. C'est la seule route qui ne passe
 * pas la garde de `_db.refuse`.
 *
 * Il n'y a plus de `PUT` : le paquet est dérivé de la table (voir `_bundle`), et
 * la rencontre y arrive déjà par la file d'attente de la table de marque.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET')) return

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'id manquant' })

  const p = await bundle(id)
  if (!p) return res.status(404).json({ error: 'Rencontre introuvable' })

  return res.status(200).json(p)
}
