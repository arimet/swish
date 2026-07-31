import { describe, expect, it } from 'vitest'
import { playingTimes } from './playingtime'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', teamAId: 'a', teamBId: 'b' },
  roster: { A: ['p1', 'p2', 'p3'], B: [] }, status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

describe('playingTimes', () => {
  it('accumule le temps des titulaires pendant que le chrono tourne', () => {
    const t = playingTimes(mk([
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1', 'p2'] },
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'CLOCK_STOP', gameClock: 540 }, // 60 s jouées
    ]), 'A')
    expect(t.get('p1')).toBe(60)
    expect(t.get('p2')).toBe(60)
    expect(t.get('p3') ?? 0).toBe(0) // sur le banc
  })
  it('gère un changement en cours de chrono', () => {
    const t = playingTimes(mk([
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { type: 'CLOCK_START', gameClock: 600 },
      { type: 'SUBSTITUTION', team: 'A', playerInId: 'p2', playerOutId: 'p1', gameClock: 570 }, // p1: 30s
      { type: 'CLOCK_STOP', gameClock: 540 }, // p2: 30s
    ]), 'A')
    expect(t.get('p1')).toBe(30)
    expect(t.get('p2')).toBe(30)
  })
  it("n'accumule rien quand le chrono est arrêté", () => {
    const t = playingTimes(mk([
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
    ]), 'A')
    expect(t.get('p1') ?? 0).toBe(0)
  })
})
