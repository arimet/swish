import { pool } from './_db.js'
import { matches } from './_rows/match.js'

/**
 * The spectator bundle: the game, the roster and the two team names — everything
 * the remote page needs, projected out of the source of truth.
 */
export interface Bundle {
  match: unknown
  players: unknown[]
  teamNames: { A: string; B: string }
}

export async function bundle(id: string): Promise<Bundle | null> {
  if (!pool) return null
  const match = await matches.get(pool, id)
  if (!match) return null
  const { clubId, opponentId } = match.meta

  // The club's current roster, plus anyone on this sheet who has since been archived:
  // a spectator reading an old game still sees who scored.
  const [roster, teams] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `select id, team_id as "teamId", number, last_name as "lastName", first_name as "firstName"
       from players where team_id = $1 and (archived_at is null or id = any($2::text[]))`, [clubId, match.roster]),
    pool.query<{ id: string; name: string }>('select id, name from teams where id = any($1::text[])', [[clubId, opponentId]]),
  ])
  const name = (tid: string) => teams.rows.find((r) => r.id === tid)?.name ?? ''

  return { match, players: roster.rows.map(publicPlayer), teamNames: { A: name(clubId), B: name(opponentId) } }
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
