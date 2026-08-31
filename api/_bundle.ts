import { pool } from './_db.js'

/**
 * The spectator bundle: the game, the roster and the two team names — everything
 * the remote page needs, projected out of the source of truth.
 */
export interface Bundle {
  match: unknown
  players: unknown[]
  teamNames: { A: string; B: string }
}

interface Row { doc: Record<string, unknown> }

export async function bundle(id: string): Promise<Bundle | null> {
  if (!pool) return null

  const { rows: m } = await pool.query<Row>(
    "select doc from documents where kind = 'match' and id = $1", [id])
  if (!m.length) return null

  const match = m[0].doc
  const meta = (match.meta ?? {}) as { clubId?: string; opponentId?: string }
  const clubId = meta.clubId ?? ''
  const opponentId = meta.opponentId ?? ''

  const [roster, teams] = await Promise.all([
    pool.query<Row>(
      "select doc from documents where kind = 'player' and doc ->> 'teamId' = $1", [clubId]),
    pool.query<Row>(
      "select doc from documents where kind = 'team' and id = any($1::text[])", [[clubId, opponentId]]),
  ])

  const name = (tid: string) =>
    (teams.rows.find((r) => r.doc.id === tid)?.doc.name as string | undefined) ?? ''

  return {
    match,
    players: roster.rows.map((r) => publicPlayer(r.doc)),
    teamNames: { A: name(clubId), B: name(opponentId) },
  }
}

/**
 * What the spectator page is entitled to know about a player: their number and
 * their name, enough to read a match sheet.
 *
 * The live link is **public** — it is sent to parents, projected in the hall — and
 * until now it carried the whole record: licence, birth date and height included,
 * for players who are sometimes minors. Nothing on screen used any of it; it was a
 * leak by copy-paste, not by intent.
 *
 * The list is **positive**: it enumerates what goes out, not what is stripped. A
 * field added to `Player` some day will therefore not find itself published by
 * default.
 */
function publicPlayer(p: Record<string, unknown>) {
  return { id: p.id, teamId: p.teamId, number: p.number, lastName: p.lastName, firstName: p.firstName }
}
