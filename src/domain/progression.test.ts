import { describe, expect, it } from 'vitest'
import { scoreProgression, matchRatios } from './progression'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', teamAId: 'a', teamBId: 'b' },
  roster: { A: ['p1'], B: ['q1'] }, status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: e.gameClock ?? 600, ...e } as GameEvent)),
})

describe('scoreProgression', () => {
  it('commence à 0-0 et cumule les paniers', () => {
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
  it('calcule avantage max, série max et points du banc', () => {
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
  it('compte les égalités (hors 0-0 initial)', () => {
    const r = matchRatios(mk([
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', gameClock: 590 }, // 2-0
      { type: 'SCORE', team: 'B', playerId: 'q1', kind: '2int', gameClock: 580 }, // 2-2 égalité
    ]))
    expect(r.ties).toBe(1)
  })
})
