import { describe, expect, it } from 'vitest'
import { playingTimes } from './playingtime'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1', 'p2', 'p3'], status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

describe('playingTimes', () => {
  it('accumulates the starters\' time while the clock runs', () => {
    const t = playingTimes(mk([
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1', 'p2'] },
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'CLOCK_STOP', gameClock: 540 }, // 60 s jouées
    ]))
    expect(t.get('p1')).toBe(60)
    expect(t.get('p2')).toBe(60)
    expect(t.get('p3') ?? 0).toBe(0) // on the bench
  })
  it('handles a substitution with the clock running', () => {
    const t = playingTimes(mk([
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'SUBSTITUTION', team: 'A', playerInId: 'p2', playerOutId: 'p1', gameClock: 570 }, // p1: 30s
      { type: 'CLOCK_STOP', gameClock: 540 }, // p2: 30s
    ]))
    expect(t.get('p1')).toBe(30)
    expect(t.get('p2')).toBe(30)
  })
  it("accumulates nothing while the clock is stopped", () => {
    const t = playingTimes(mk([
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
    ]))
    expect(t.get('p1') ?? 0).toBe(0)
  })
})
