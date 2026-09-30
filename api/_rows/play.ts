import type { Play } from '../../src/domain/plays.js'
import { compact, iso, tableStore } from './db.js'

interface Row {
  id: string; club_id: string; name: string; note: string | null; court: Play['court']
  defense: boolean; folder: string | null; drawing: Pick<Play, 'props' | 'steps'>; updated_at: Date | string | null
}

export const toRow = (p: Play): Row => ({
  id: p.id, club_id: p.clubId, name: p.name, note: p.note ?? null, court: p.court, defense: p.defense,
  folder: p.folder ?? null, drawing: { props: p.props, steps: p.steps }, updated_at: p.updatedAt ?? null,
})
export const fromRow = (r: Row): Play => compact({
  id: r.id, clubId: r.club_id, name: r.name, note: r.note, court: r.court, defense: r.defense,
  props: r.drawing.props, steps: r.drawing.steps, folder: r.folder, updatedAt: iso(r.updated_at),
})

export const plays = tableStore<Play, Row>({
  table: 'plays', view: 'active_plays', key: 'id',
  columns: ['id', 'club_id', 'name', 'note', 'court', 'defense', 'folder', 'drawing', 'updated_at'],
  toRow, fromRow,
})
