import { describe, expect, it } from 'vitest'
import { teamRecord, teamMatches, teamScorers } from './teamRecord'
import type { Match, GameEvent } from './types'

let seq = 0
const ev = (e: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent =>
  ({ id: `e${seq++}`, wallClock: seq, period: 1, gameClock: 600, ...e } as GameEvent)

// Match terminé où `home` marque `sa`, `away` marque `sb`.
const finished = (id: string, home: string, away: string, sa: number, sb: number, date: string): Match => ({
  id, meta: { championshipLabel: 'PRM', teamAId: home, teamBId: away, date },
  roster: { A: ['h1'], B: ['a1'] },
  events: [
    ev({ type: 'PERIOD_START' }), ev({ type: 'CLOCK_START' }),
    ...Array.from({ length: sa }, () => ev({ type: 'SCORE', team: 'A', playerId: 'h1', kind: 'lf' } as Partial<GameEvent> & { type: 'SCORE' })),
    ...Array.from({ length: sb }, () => ev({ type: 'SCORE', team: 'B', playerId: 'a1', kind: 'lf' } as Partial<GameEvent> & { type: 'SCORE' })),
  ],
  status: 'finished',
})

describe('teamRecord', () => {
  it('compte victoires, défaites et points pour/contre', () => {
    const matches = [
      finished('m1', 't1', 't2', 70, 60, '2026-01-10'), // t1 gagne
      finished('m2', 't3', 't1', 80, 50, '2026-01-17'), // t1 perd
    ]
    const r = teamRecord('t1', matches)
    expect(r).toMatchObject({ played: 2, wins: 1, losses: 1, pointsFor: 120, pointsAgainst: 140 })
    expect(r.avgFor).toBe(60)
    expect(r.avgAgainst).toBe(70)
  })
  it('ignore les rencontres où l\'équipe ne joue pas', () => {
    expect(teamRecord('tX', [finished('m1', 't1', 't2', 70, 60, '2026-01-10')]).played).toBe(0)
  })
})

describe('teamMatches', () => {
  it('renvoie les rencontres de l\'équipe, plus récente d\'abord, avec résultat', () => {
    const lines = teamMatches('t1', [
      finished('m1', 't1', 't2', 70, 60, '2026-01-10'),
      finished('m2', 't3', 't1', 80, 50, '2026-01-17'),
    ])
    expect(lines.map((l) => l.match.id)).toEqual(['m2', 'm1']) // tri date desc
    expect(lines[0]).toMatchObject({ opponentId: 't3', scored: 50, conceded: 80, result: 'D' })
    expect(lines[1]).toMatchObject({ opponentId: 't2', scored: 70, conceded: 60, result: 'V' })
  })
})

describe('teamScorers', () => {
  it('cumule les points par joueur', () => {
    const s = teamScorers('t1', [finished('m1', 't1', 't2', 5, 3, '2026-01-10')])
    expect(s.get('h1')).toBe(5)
    expect(s.has('a1')).toBe(false) // joueur adverse exclu
  })
})
