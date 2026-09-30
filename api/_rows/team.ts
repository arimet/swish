import type { Team } from '../../src/domain/types.js'
import { compact, tableStore } from './db.js'

interface Row { id: string; name: string; coach: string | null }

export const toRow = (t: Team): Row => ({ id: t.id, name: t.name, coach: t.coach ?? null })
export const fromRow = (r: Row): Team => compact({ id: r.id, name: r.name, coach: r.coach })

export const teams = tableStore<Team, Row>({
  table: 'teams', view: 'active_teams', key: 'id', columns: ['id', 'name', 'coach'], toRow, fromRow,
})
