import Dexie, { type Table } from 'dexie'
import type { Team, Player, Match, ReportedResult, Convocation, Training, MessageEquipe } from '../domain/types'
import type { Schema } from '../domain/plays'

/** File d'attente de synchronisation (offline-first) : mutations à pousser vers le serveur. */
export interface OutboxItem {
  seq?: number
  /** Les huit genres partagés. Le message et la convocation sont **clés sur autre
   *  chose que `id`** — le club pour l'un, la rencontre pour l'autre — ce que la
   *  table serveur accepte sans broncher : elle n'a qu'un couple (genre, clef). */
  kind: 'team' | 'player' | 'match' | 'result' | 'convocation' | 'training' | 'play' | 'message'
  op: 'put' | 'del'
  id: string
  doc?: unknown
  ts: number
  /** Quand la personne a modifié, sur cet appareil, au format ISO. C'est ce que
   *  le serveur compare pour arbitrer un conflit — l'heure du geste, et non
   *  celle de l'arrivée. Non indexé, donc aucune version de base à ajouter. */
  modifiedAt: string
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
  messages!: Table<MessageEquipe, string>
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
    // v6 : le message du coach à son équipe. Un seul par club : le club EST la
    // clé, ce qui rend le remplacement gratuit (un `put` suffit) et rend
    // impossible la messagerie qu'on ne veut pas. Strictement additif : aucune
    // donnée existante n'est touchée.
    this.version(6).stores({
      messages: 'clubId',
    })
  }
}
export const db = new ScoreSheetDB()
