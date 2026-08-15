import { describe, expect, it } from 'vitest'
import { teamTotals } from './totals'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm',
  meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1', 'p2'],
  status: 'live',
  events: events.map((e, i) => ({
    id: `e${i}`,
    wallClock: i,
    period: e.period ?? 1,
    gameClock: 600,
    ...e,
  } as GameEvent)),
})

describe('teamTotals', () => {
  it('separates starters and bench', () => {
    const t = teamTotals(
      mk([
        { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
        { type: 'CLOCK_START' },
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
        { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3' },
      ]),
    )
    expect(t.team.points).toBe(5)
    expect(t.starters.points).toBe(2)
    expect(t.bench.points).toBe(3)
  })

  it('separates first and second half', () => {
    const t = teamTotals(
      mk([
        { type: 'CLOCK_START', period: 2 },
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 2 },
        { type: 'CLOCK_START', period: 3 },
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', period: 3 },
      ]),
    )
    expect(t.firstHalf.points).toBe(2)
    expect(t.secondHalf.points).toBe(3)
  })

  it('counts coach fouls separately', () => {
    const t = teamTotals(
      mk([
        { type: 'FOUL', team: 'A', target: { kind: 'coach' }, foulType: 'technical' },
      ]),
    )
    expect(t.coachFouls).toBe(1)
  })

  it('excludes bench fouls from the buckets', () => {
    const t = teamTotals(
      mk([
        { type: 'FOUL', team: 'A', target: { kind: 'bench' }, foulType: 'technical' },
      ]),
    )
    expect(t.firstHalf.fouls).toBe(0)
    expect(t.coachFouls).toBe(0)
  })

  it('an overtime bucket for period >= 5', () => {
    const t = teamTotals(
      mk([
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 5 },
      ]),
    )
    expect(t.overtime.points).toBe(2)
    expect(t.firstHalf.points).toBe(0)
    expect(t.secondHalf.points).toBe(0)
  })

  it('ignores the opposition\'s baskets (side B) in our totals, including per period', () => {
    const t = teamTotals(
      mk([
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
        { type: 'SCORE', team: 'B', kind: '3' }, // panier adverse : sans joueur identifié, hors de nos totaux
      ]),
    )
    expect(t.team.points).toBe(2)
    // t.team.points derives from playerStats (already locked down elsewhere); only
    // this assertion protects teamTotals' own per-period loop.
    expect(t.firstHalf.points).toBe(2)
  })
})
