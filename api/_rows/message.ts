import type { TeamMessage } from '../../src/domain/types.js'
import { iso, tableStore } from './db.js'

interface Row { club_id: string; text: string; written_at: Date | string }

export const toRow = (m: TeamMessage): Row => ({ club_id: m.clubId, text: m.text, written_at: m.writtenAt })
export const fromRow = (r: Row): TeamMessage => ({ clubId: r.club_id, text: r.text, writtenAt: iso(r.written_at)! })

/** Filed under the club: one message per club, and writing a new one replaces it. */
export const messages = tableStore<TeamMessage, Row>({
  table: 'team_messages', view: 'active_team_messages', key: 'club_id',
  columns: ['club_id', 'text', 'written_at'], toRow, fromRow,
})
