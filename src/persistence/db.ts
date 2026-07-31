import Dexie, { type Table } from 'dexie'
import type { Team, Player, Match } from '../domain/types'

export class ScoreSheetDB extends Dexie {
  teams!: Table<Team, string>
  players!: Table<Player, string>
  matches!: Table<Match, string>
  constructor() {
    super('score-sheet')
    this.version(1).stores({
      teams: 'id, name',
      players: 'id, teamId',
      matches: 'id, status',
    })
  }
}
export const db = new ScoreSheetDB()
