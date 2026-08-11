import { db } from './db'
import { enqueuePut, enqueueDel, remoteEnabled, hydrate } from './remote'
import type { Team, Player, Match, ReportedResult } from '../domain/types'

// Écritures : cache local (immédiat, offline-ok) + mise en file pour le serveur.
export const saveTeam = async (t: Team) => { await db.teams.put(t); await enqueuePut('team', t.id, t) }
export const getTeam = (id: string) => db.teams.get(id)
export const getPlayer = (id: string) => db.players.get(id)
export const listTeams = () => db.teams.toArray()
/** Supprime une équipe, ses joueurs, et les résultats saisis à la main qui la
 *  mentionnent (d'un côté comme de l'autre) : un résultat dont une équipe n'existe
 *  plus n'a plus de sens, on le supprime plutôt que de le laisser hanter le
 *  classement sous son identifiant brut. La table des résultats reste petite ; un
 *  filtrage sur `toArray()` évite d'ajouter un index Dexie pour si peu. */
export const deleteTeam = async (id: string) => {
  const players = await db.players.where('teamId').equals(id).toArray()
  const résultats = (await db.results.toArray()).filter((r) => r.homeId === id || r.awayId === id)
  await db.transaction('rw', db.teams, db.players, db.results, async () => {
    await db.players.where('teamId').equals(id).delete()
    await db.teams.delete(id)
    await db.results.bulkDelete(résultats.map((r) => r.id))
  })
  for (const p of players) await enqueueDel('player', p.id)
  await enqueueDel('team', id)
}

export const savePlayer = async (p: Player) => { await db.players.put(p); await enqueuePut('player', p.id, p) }
export const listPlayers = (teamId: string) => db.players.where('teamId').equals(teamId).toArray()
export const deletePlayer = async (id: string) => { await db.players.delete(id); await enqueueDel('player', id) }

export const saveMatch = async (m: Match) => { await db.matches.put(m); await enqueuePut('match', m.id, m) }
/** Match local ; à défaut, tente une hydratation depuis le serveur (autre machine). */
export const getMatch = async (id: string): Promise<Match | undefined> => {
  let m = await db.matches.get(id)
  if (!m && remoteEnabled()) { await hydrate(); m = await db.matches.get(id) }
  return m
}
export const listMatches = () => db.matches.toArray()
export const deleteMatch = async (id: string) => { await db.matches.delete(id); await enqueueDel('match', id) }

/** Les résultats saisis restent locaux à l'appareil : ils ne passent pas par la file
 *  de synchronisation, qui ne transporte qu'équipes, joueurs et rencontres. */
export const listResults = () => db.results.toArray()
export const saveResult = async (r: ReportedResult) => { await db.results.put(r) }
export const deleteResult = async (id: string) => { await db.results.delete(id) }
