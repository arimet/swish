import { describe, expect, it } from 'vitest'
import { teamTotals } from './totals'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm',
  meta: { championshipLabel: 'x', teamAId: 'a', teamBId: 'b' },
  roster: { A: ['p1', 'p2'], B: [] },
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
  it('separe titulaires et banc', () => {
    const t = teamTotals(
      mk([
        { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
        { type: 'CLOCK_START' },
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
        { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3' },
      ]),
      'A'
    )
    expect(t.team.points).toBe(5)
    expect(t.starters.points).toBe(2)
    expect(t.bench.points).toBe(3)
  })

  it('separe 1ere et 2eme mi-temps', () => {
    const t = teamTotals(
      mk([
        { type: 'CLOCK_START', period: 2 },
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 2 },
        { type: 'CLOCK_START', period: 3 },
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', period: 3 },
      ]),
      'A'
    )
    expect(t.firstHalf.points).toBe(2)
    expect(t.secondHalf.points).toBe(3)
  })

  it('compte les fautes coach a part', () => {
    const t = teamTotals(
      mk([
        { type: 'FOUL', team: 'A', target: { kind: 'coach' }, foulType: 'technical' },
      ]),
      'A'
    )
    expect(t.coachFouls).toBe(1)
  })

  it('exclut les fautes banc des buckets', () => {
    const t = teamTotals(
      mk([
        { type: 'FOUL', team: 'A', target: { kind: 'bench' }, foulType: 'technical' },
      ]),
      'A'
    )
    expect(t.firstHalf.fouls).toBe(0)
    expect(t.coachFouls).toBe(0)
  })

  it('bucket overtime pour period >= 5', () => {
    const t = teamTotals(
      mk([
        { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 5 },
      ]),
      'A'
    )
    expect(t.overtime.points).toBe(2)
    expect(t.firstHalf.points).toBe(0)
    expect(t.secondHalf.points).toBe(0)
  })
})
