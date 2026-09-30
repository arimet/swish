import type { ReportedResult } from '../../src/domain/types.js'
import { compact, tableStore } from './db.js'

interface Row {
  id: string; championship_label: string; date: string | null
  home_id: string; away_id: string; home_score: number; away_score: number
}

export const toRow = (r: ReportedResult): Row => ({
  id: r.id, championship_label: r.championshipLabel, date: r.date ?? null,
  home_id: r.homeId, away_id: r.awayId, home_score: r.homeScore, away_score: r.awayScore,
})
export const fromRow = (r: Row): ReportedResult => compact({
  id: r.id, championshipLabel: r.championship_label, date: r.date,
  homeId: r.home_id, awayId: r.away_id, homeScore: r.home_score, awayScore: r.away_score,
})

export const results = tableStore<ReportedResult, Row>({
  table: 'reported_results', view: 'active_reported_results', key: 'id',
  columns: ['id', 'championship_label', 'date', 'home_id', 'away_id', 'home_score', 'away_score'],
  toRow, fromRow,
})
