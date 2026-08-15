import { pool } from './_db.js'

/**
 * Le paquet du suivi spectateur : la rencontre, l'effectif et les deux noms
 * d'équipe — tout ce dont la page distante a besoin, puisqu'elle n'a pas de base
 * locale.
 *
 * Il est **dérivé** de la table, et non plus publié à part par la table de
 * marque. C'est une simplification franche : la rencontre arrive déjà par la file
 * d'attente, donc la publier une seconde fois était deux chemins d'écriture pour
 * une même donnée, avec deux façons de se contredire — et une durée de vie de
 * douze heures au bout de laquelle le suivi d'un match du matin s'éteignait.
 *
 * `rev` est le plus grand numéro d'écriture des lignes qui composent le paquet :
 * le flux SSE s'en sert pour n'émettre que sur changement réel.
 */
export interface Paquet {
  match: unknown
  players: unknown[]
  teamNames: { A: string; B: string }
  rev: number
}

interface Ligne { doc: Record<string, unknown>; rev: string }

export async function paquet(id: string): Promise<Paquet | null> {
  if (!pool) return null

  const { rows: m } = await pool.query<Ligne>(
    "select doc, rev from documents where kind = 'match' and id = $1", [id])
  if (!m.length) return null

  const match = m[0].doc
  const meta = (match.meta ?? {}) as { clubId?: string; opponentId?: string }
  const clubId = meta.clubId ?? ''
  const opponentId = meta.opponentId ?? ''

  const [effectif, equipes] = await Promise.all([
    pool.query<Ligne>(
      "select doc, rev from documents where kind = 'player' and doc ->> 'teamId' = $1", [clubId]),
    pool.query<Ligne>(
      "select doc, rev from documents where kind = 'team' and id = any($1::text[])", [[clubId, opponentId]]),
  ])

  const nom = (tid: string) =>
    (equipes.rows.find((r) => r.doc.id === tid)?.doc.name as string | undefined) ?? ''

  const rev = Math.max(
    ...[...m, ...effectif.rows, ...equipes.rows].map((r) => Number(r.rev)),
  )

  return {
    match,
    players: effectif.rows.map((r) => reduit(r.doc)),
    teamNames: { A: nom(clubId), B: nom(opponentId) },
    rev,
  }
}

/**
 * Ce que la page spectateur a le droit de savoir d'un joueur : son numéro et son
 * nom, de quoi lire une feuille de match.
 *
 * Le lien de suivi est **public** — on l'envoie à des parents, on le projette dans
 * la salle — et il transportait jusqu'ici la fiche entière : licence, date de
 * naissance et taille comprises, pour des joueurs parfois mineurs. Rien à l'écran
 * ne s'en servait ; c'était une fuite par recopie, pas par intention.
 *
 * La liste est **positive** : on énumère ce qui sort, et non ce qu'on retire. Un
 * champ ajouté un jour à `Player` ne se retrouvera donc pas publié par défaut.
 */
function reduit(p: Record<string, unknown>) {
  return { id: p.id, teamId: p.teamId, number: p.number, lastName: p.lastName, firstName: p.firstName }
}
