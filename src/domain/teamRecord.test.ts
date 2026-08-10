import { describe, expect, it } from 'vitest'
import { teamRecord, teamMatches, teamScorers } from './teamRecord'
import type { Match, GameEvent } from './types'

let seq = 0
const ev = (e: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent =>
  ({ id: `e${seq++}`, wallClock: seq, period: 1, gameClock: 600, ...e } as GameEvent)

// Match terminé où notre club (`clubId`) affronte `opponentId` : `sa` est notre
// score, `sb` celui de l'adversaire (panier d'équipe, sans joueur identifié).
const finished = (id: string, clubId: string, opponentId: string, sa: number, sb: number, date: string): Match => ({
  id, meta: { championshipLabel: 'PRM', clubId, opponentId, date },
  roster: ['h1'],
  events: [
    ev({ type: 'PERIOD_START' }), ev({ type: 'CLOCK_START' }),
    ...Array.from({ length: sa }, () => ev({ type: 'SCORE', team: 'A', playerId: 'h1', kind: 'lf' } as Partial<GameEvent> & { type: 'SCORE' })),
    ...Array.from({ length: sb }, () => ev({ type: 'SCORE', team: 'B', kind: 'lf' } as Partial<GameEvent> & { type: 'SCORE' })),
  ],
  status: 'finished',
})

describe('teamRecord', () => {
  it('compte victoires, défaites et points pour/contre (notre club)', () => {
    const matches = [
      finished('m1', 't1', 't2', 70, 60, '2026-01-10'), // t1 gagne
      finished('m2', 't1', 't3', 50, 80, '2026-01-17'), // t1 perd
    ]
    const r = teamRecord('t1', matches)
    expect(r).toMatchObject({ played: 2, wins: 1, losses: 1, pointsFor: 120, pointsAgainst: 140 })
    expect(r.avgFor).toBe(60)
    expect(r.avgAgainst).toBe(70)
  })
  it('ignore les rencontres où l\'équipe ne joue pas', () => {
    expect(teamRecord('tX', [finished('m1', 't1', 't2', 70, 60, '2026-01-10')]).played).toBe(0)
  })
  it('lu côté adversaire, le bilan est celui de nos confrontations avec lui', () => {
    // t2 a perdu 60-70 contre nous : de son point de vue, une défaite.
    const r = teamRecord('t2', [finished('m1', 't1', 't2', 70, 60, '2026-01-10')])
    expect(r).toMatchObject({ played: 1, wins: 0, losses: 1, pointsFor: 60, pointsAgainst: 70 })
  })
})

describe('teamMatches', () => {
  it('renvoie les rencontres de l\'équipe, plus récente d\'abord, avec résultat', () => {
    const lines = teamMatches('t1', [
      finished('m1', 't1', 't2', 70, 60, '2026-01-10'),
      finished('m2', 't1', 't3', 50, 80, '2026-01-17'),
    ])
    expect(lines.map((l) => l.match.id)).toEqual(['m2', 'm1']) // tri date desc
    expect(lines[0]).toMatchObject({ opponentId: 't3', scored: 50, conceded: 80, result: 'D' })
    expect(lines[1]).toMatchObject({ opponentId: 't2', scored: 70, conceded: 60, result: 'V' })
  })
})

describe('teamScorers', () => {
  it('cumule les points par joueur pour notre club', () => {
    const s = teamScorers('t1', [finished('m1', 't1', 't2', 5, 3, '2026-01-10')])
    expect(s.get('h1')).toBe(5)
  })
  it('l\'adversaire n\'a pas d\'effectif : son cumul est toujours vide', () => {
    const s = teamScorers('t2', [finished('m1', 't1', 't2', 5, 3, '2026-01-10')])
    expect(s.size).toBe(0)
  })
})
