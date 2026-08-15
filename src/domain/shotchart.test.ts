import { describe, expect, it } from 'vitest'
import { shootingPct, shotsOf, zoneSummary } from './shotchart'
import type { GameEvent, Match } from './types'

const mk = (id: string, events: Partial<GameEvent>[]): Match => ({
  id, meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1', 'p2'], status: 'finished',
  events: events.map((e, i) => ({ id: `${id}-e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

const TOP3 = { x: 0.5, y: 0.65 }
const PAINT = { x: 0.5, y: 0.15 }

describe('shotsOf', () => {
  it('gathers a player\'s shots across several games', () => {
    const shots = shotsOf([
      mk('m1', [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]),
      mk('m2', [{ type: 'MISS', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT }]),
    ], 'p1')
    expect(shots).toHaveLength(2)
    expect(shots.map((s) => s.zone)).toEqual(['top3', 'paint'])
    expect(shots.map((s) => s.made)).toEqual([true, false])
    expect(shots.map((s) => s.matchId)).toEqual(['m1', 'm2'])
  })

  it('excludes other players\' shots', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3', shot: TOP3 },
    ])
    expect(shotsOf([m], 'p1')).toHaveLength(1)
  })

  it('excludes free throws and baskets with no spot', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: 'lf' },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' }, // raccourci sans position
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    ])
    expect(shotsOf([m], 'p1')).toHaveLength(1)
  })
})

describe('zoneSummary', () => {
  it('sums makes and attempts per zone, at zero everywhere else', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
    ])
    const sum = zoneSummary(shotsOf([m], 'p1'))
    expect(sum.top3).toEqual({ made: 1, attempts: 2 })
    expect(sum.paint).toEqual({ made: 1, attempts: 1 })
    expect(sum.corner3_left).toEqual({ made: 0, attempts: 0 })
  })
})

describe('shootingPct', () => {
  it('computes the overall and three-point percentages', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
    ])
    expect(shootingPct(shotsOf([m], 'p1'))).toEqual({ fg: 75, three: 50 })
  })

  it('returns null rather than zero when there is no shot', () => {
    expect(shootingPct([])).toEqual({ fg: null, three: null })
  })
})
