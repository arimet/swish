import { describe, expect, it } from 'vitest'
import { liveState, timeoutsAllowed, TEAM_FOUL_BONUS } from './ffbb'
import type { Match, GameEvent } from '../domain/types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1', 'p2'], status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: e.period ?? 1, gameClock: e.gameClock ?? 600, ...e } as GameEvent)),
})

describe("timeoutsAllowed", () => {
  it("2 in the first half, 5 cumulative in the second, +1 per overtime", () => {
    expect(timeoutsAllowed(1)).toBe(2)
    expect(timeoutsAllowed(2)).toBe(2)
    expect(timeoutsAllowed(3)).toBe(5)
    expect(timeoutsAllowed(4)).toBe(5)
    expect(timeoutsAllowed(5)).toBe(6)
  })
})

describe("liveState", () => {
  it("bonus when a team reaches 5 fouls in the period", () => {
    const events: Partial<GameEvent>[] = [
      { type: 'PERIOD_START' as const, period: 1 },
      ...Array(TEAM_FOUL_BONUS).fill(null).map(() => ({
        type: 'FOUL' as const, team: 'A' as const, target: { kind: 'player' as const, playerId: 'p1' }, foulType: 'personal' as const, period: 1,
      })),
    ]
    const s = liveState(mk(events))
    expect(s.teamFoulsThisPeriod.A).toBe(5)
    expect(s.bonus.A).toBe(true)
    expect(s.bonus.B).toBe(false)
  })
  it("resets the team fouls on a period change", () => {
    const s = liveState(mk([
      { type: 'FOUL' as const, team: 'A' as const, target: { kind: 'player' as const, playerId: 'p1' }, foulType: 'personal' as const, period: 1 },
      { type: 'PERIOD_START' as const, period: 2 },
    ]))
    expect(s.teamFoulsThisPeriod.A).toBe(0)
    expect(s.period).toBe(2)
  })
  it("fouls a player out at 5", () => {
    const events: Partial<GameEvent>[] = Array(5).fill(null).map(() => ({
      type: 'FOUL' as const, team: 'A' as const, target: { kind: 'player' as const, playerId: 'p1' }, foulType: 'personal' as const, period: 1,
    }))
    expect(liveState(mk(events)).fouledOut.A).toContain('p1')
  })
  it("counts down the remaining timeouts", () => {
    const s = liveState(mk([
      { type: 'PERIOD_START' as const, period: 1 },
      { type: 'TIMEOUT' as const, team: 'A' as const, period: 1 },
    ]))
    expect(s.timeoutsUsed.A).toBe(1)
    expect(s.timeoutsRemaining.A).toBe(1) // 2 autorises - 1
  })
  it("reflects the clock's state and the five on the court", () => {
    const s = liveState(mk([
      { type: 'STARTING_FIVE' as const, team: 'A' as const, playerIds: ['p1'] },
      { type: 'PERIOD_START' as const, period: 1 },
      { type: 'CLOCK_START' as const },
    ]))
    expect(s.clockRunning).toBe(true)
    expect(s.onCourt.A).toEqual(['p1'])
  })
  it('the substitute takes the exact slot of the player going off (order preserved)', () => {
    const s = liveState(mk([
      { type: 'STARTING_FIVE' as const, team: 'A' as const, playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'] },
      { type: 'PERIOD_START' as const, period: 1 },
      { type: 'SUBSTITUTION' as const, team: 'A' as const, playerOutId: 'p2', playerInId: 'p9' },
    ]))
    // p9 remplace p2 à l'index 1, les autres ne bougent pas.
    expect(s.onCourt.A).toEqual(['p1', 'p9', 'p3', 'p4', 'p5'])
  })
  it('the opposition has no roster: never fouled out, even at 5 fouls on a roster player', () => {
    // 'p1' est dans le roster (côté A) : si fouledOutOf lisait match.roster des
    // deux côtés sans garde, il apparaîtrait à tort dans fouledOut.B.
    const events: Partial<GameEvent>[] = Array(5).fill(null).map(() => ({
      type: 'FOUL' as const, team: 'B' as const, target: { kind: 'player' as const, playerId: 'p1' }, foulType: 'personal' as const, period: 1,
    }))
    expect(liveState(mk(events)).fouledOut.B).toEqual([])
  })
  it('counts a basket with no player named in the team\'s score', () => {
    const m = mk([
      { type: 'CLOCK_START', period: 1, gameClock: 600 },
      { type: 'SCORE', team: 'B', kind: '3', period: 1, gameClock: 500 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.7 }, period: 1, gameClock: 490 },
    ])
    expect(liveState(m).score).toEqual({ a: 0, b: 3 })
  })
})
