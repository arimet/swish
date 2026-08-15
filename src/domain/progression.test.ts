import { describe, expect, it } from 'vitest'
import { scoreProgression, matchRatios } from './progression'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1'], status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: e.gameClock ?? 600, ...e } as GameEvent)),
})

describe('scoreProgression', () => {
  it('starts at 0-0 and accumulates the baskets', () => {
    const p = scoreProgression(mk([
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', gameClock: 570 },
      { type: 'SCORE', team: 'B', playerId: 'q1', kind: '3', gameClock: 540 },
    ]))
    expect(p[0]).toEqual({ t: 0, a: 0, b: 0 })
    expect(p[p.length - 1]).toEqual({ t: 60, a: 2, b: 3 })
  })
})

describe('matchRatios', () => {
  it('computes the largest lead, the longest run and the bench points', () => {
    const r = matchRatios(mk([
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', gameClock: 590 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', gameClock: 580 }, // A mène 5-0
      { type: 'SCORE', team: 'B', playerId: 'q1', kind: '2int', gameClock: 570 },
    ]))
    expect(r.A.maxLead).toBe(5)
    expect(r.A.maxRun).toBe(5) // 3 + 2 consécutifs
    expect(r.B.maxLead).toBe(0)
  })
  it('counts the ties (excluding the opening 0-0)', () => {
    const r = matchRatios(mk([
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', gameClock: 590 }, // 2-0
      { type: 'SCORE', team: 'B', playerId: 'q1', kind: '2int', gameClock: 580 }, // 2-2 égalité
    ]))
    expect(r.ties).toBe(1)
  })
})
