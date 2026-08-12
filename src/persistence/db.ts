import Dexie, { type Table } from 'dexie'
import type { Team, Player, Match, ReportedResult, Convocation, Training } from '../domain/types'
import type { Schema } from '../domain/plays'

/** File d'attente de synchronisation (offline-first) : mutations à pousser vers le serveur. */
export interface OutboxItem {
  seq?: number
  kind: 'team' | 'player' | 'match'
  op: 'put' | 'del'
  id: string
  doc?: unknown
  ts: number
}

export class ScoreSheetDB extends Dexie {
  teams!: Table<Team, string>
  players!: Table<Player, string>
  matches!: Table<Match, string>
  outbox!: Table<OutboxItem, number>
  results!: Table<ReportedResult, string>
  convocations!: Table<Convocation, string>
  trainings!: Table<Training, string>
  plays!: Table<Schema, string>
  constructor() {
    super('score-sheet')
    this.version(1).stores({
      teams: 'id, name',
      players: 'id, teamId',
      matches: 'id, status',
    })
    // v2 : file d'attente de synchronisation (les autres stores sont conservés).
    this.version(2).stores({
      outbox: '++seq',
    })
    // v3 : résultats saisis à la main pour les rencontres entre autres équipes.
    this.version(3).stores({
      results: 'id, championshipLabel',
    })
    // v4 : vie d'équipe — convocations (une par rencontre) et entraînements.
    this.version(4).stores({
      convocations: 'matchId',
      trainings: 'id, date',
    })
    // v5 : schémas du tableau tactique, propres au club (index sur `clubId`).
    this.version(5).stores({
      plays: 'id, clubId',
    })
  }
}
export const db = new ScoreSheetDB()
