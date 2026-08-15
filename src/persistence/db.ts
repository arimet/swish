import Dexie, { type Table } from 'dexie'
import type { Team, Player, Match, ReportedResult, Convocation, Training, TeamMessage } from '../domain/types'
import type { Play } from '../domain/plays'

/** Sync queue (offline-first): mutations waiting to be pushed to the server. */
export interface OutboxItem {
  seq?: number
  /** The eight shared kinds. The message and the call-up are **keyed on something
   *  other than `id`** — the club for one, the game for the other — which the
   *  server table accepts without blinking: all it has is a (kind, key) pair. */
  kind: 'team' | 'player' | 'match' | 'result' | 'convocation' | 'training' | 'play' | 'message'
  op: 'put' | 'del'
  id: string
  doc?: unknown
  ts: number
  /** When the person made the change, on this device, in ISO format. This is what
   *  the server compares to arbitrate a conflict — the time of the gesture, not
   *  the time of arrival. Not indexed, so no store version to add. */
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
  plays!: Table<Play, string>
  messages!: Table<TeamMessage, string>
  constructor() {
    super('score-sheet')
    this.version(1).stores({
      teams: 'id, name',
      players: 'id, teamId',
      matches: 'id, status',
    })
    // v2: the sync queue (the other stores are preserved).
    this.version(2).stores({
      outbox: '++seq',
    })
    // v3: hand-entered results for games between other teams.
    this.version(3).stores({
      results: 'id, championshipLabel',
    })
    // v4: team life — call-ups (one per game) and training sessions.
    this.version(4).stores({
      convocations: 'matchId',
      trainings: 'id, date',
    })
    // v5: playbook plays, owned by the club (indexed on `clubId`).
    this.version(5).stores({
      plays: 'id, clubId',
    })
    // v6: the coach's message to the team. One per club: the club IS the key,
    // which makes replacement free (a `put` is enough) and makes the messaging
    // system we do not want impossible. Strictly additive: no existing data is
    // touched.
    this.version(6).stores({
      messages: 'clubId',
    })
  }
}
export const db = new ScoreSheetDB()
