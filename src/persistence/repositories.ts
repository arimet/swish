import { db } from './db'
import type { Team, Player, Match } from '../domain/types'

export const saveTeam = (t: Team) => db.teams.put(t)
export const getTeam = (id: string) => db.teams.get(id)
export const listTeams = () => db.teams.toArray()
/** Supprime une équipe et tous ses joueurs. */
export const deleteTeam = (id: string) =>
  db.transaction('rw', db.teams, db.players, async () => {
    await db.players.where('teamId').equals(id).delete()
    await db.teams.delete(id)
  })
export const savePlayer = (p: Player) => db.players.put(p)
export const listPlayers = (teamId: string) => db.players.where('teamId').equals(teamId).toArray()
export const deletePlayer = (id: string) => db.players.delete(id)
export const saveMatch = (m: Match) => db.matches.put(m)
export const getMatch = (id: string) => db.matches.get(id)
export const listMatches = () => db.matches.toArray()
export const deleteMatch = (id: string) => db.matches.delete(id)
