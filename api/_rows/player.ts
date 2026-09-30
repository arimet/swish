import type { Player } from '../../src/domain/types.js'
import { compact, tableStore } from './db.js'

interface Row {
  id: string; team_id: string; number: number; last_name: string; first_name: string
  license: string | null; birth_date: string | null; height_cm: number | null
}

export const toRow = (p: Player): Row => ({
  id: p.id, team_id: p.teamId, number: p.number, last_name: p.lastName, first_name: p.firstName,
  license: p.license ?? null, birth_date: p.birthDate ?? null, height_cm: p.height ?? null,
})
export const fromRow = (r: Row): Player => compact({
  id: r.id, teamId: r.team_id, number: r.number, lastName: r.last_name, firstName: r.first_name,
  license: r.license, birthDate: r.birth_date, height: r.height_cm,
})

export const players = tableStore<Player, Row>({
  table: 'players', view: 'active_players', key: 'id',
  columns: ['id', 'team_id', 'number', 'last_name', 'first_name', 'license', 'birth_date', 'height_cm'],
  toRow, fromRow,
})
