import { describe, expect, it } from 'vitest'
import { playerStats, pointsForKind } from './boxscore'
import { liveState } from '../rules/ffbb'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1', 'p2'], status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

describe('pointsForKind', () => {
  it('maps shot kinds to their points', () => {
    expect(pointsForKind('lf')).toBe(1)
    expect(pointsForKind('2int')).toBe(2)
    expect(pointsForKind('2ext')).toBe(2)
    expect(pointsForKind('3')).toBe(3)
  })
})

describe('playerStats', () => {
  it('aggregates the shots and applies the confirmed formula (the MILAS case: 8 shots, 21 pts)', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'CLOCK_START' },
      ...Array(1).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3' }),
      ...Array(5).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' }),
      ...Array(2).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2ext' }),
      ...Array(4).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: 'lf' }),
    ]
    const p1 = playerStats(mk(events)).find((s) => s.playerId === 'p1')!
    expect(p1.threes).toBe(1)
    expect(p1.twoInside).toBe(5)
    expect(p1.twoOutside).toBe(2)
    expect(p1.freeThrows).toBe(4)
    expect(p1.fieldGoalsMade).toBe(8) // 1 + 5 + 2
    expect(p1.points).toBe(21)        // 3 + 10 + 4 + 4
  })
  it('counts the player\'s fouls', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' },
      { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'technical' },
    ]
    const p1 = playerStats(mk(events)).find((s) => s.playerId === 'p1')!
    expect(p1.fouls).toBe(2)
  })
  it('marks the starters from STARTING_FIVE', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
    ]
    const stats = playerStats(mk(events))
    expect(stats.find((s) => s.playerId === 'p1')!.isStarter).toBe(true)
    expect(stats.find((s) => s.playerId === 'p2')!.isStarter).toBe(false)
  })
  it('returns one row per roster player, order preserved', () => {
    expect(playerStats(mk([])).map((s) => s.playerId)).toEqual(['p1', 'p2'])
  })
  it('aggregates assists, offensive and defensive rebounds, and blocks', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'reb_off' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'reb_def' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'block' },
      { type: 'STAT', team: 'B', playerId: 'q1', stat: 'assist' }, // opposition, ignored (playerStats only reads side A)
    ]
    const p1 = playerStats(mk(events)).find((s) => s.playerId === 'p1')!
    expect(p1).toMatchObject({ assists: 2, offRebounds: 1, defRebounds: 1, blocks: 1 })
  })
})

describe('playerStats — missed shots and team baskets', () => {
  it('counts missed shots without adding points', () => {
    const m = mk([
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.7 } },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '2int', shot: { x: 0.5, y: 0.15 } },
    ])
    const [p1] = playerStats(m)
    expect(p1.points).toBe(3)
    expect(p1.fieldGoalsMade).toBe(1)
    expect(p1.misses).toBe(2)
  })

  it('ignores a basket with no player named in the individual rows, but it counts in the score', () => {
    const m = mk([
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
      { type: 'SCORE', team: 'B', kind: '3' }, // an opposition basket: no player named, they have no roster
    ])
    const stats = playerStats(m)
    expect(stats.reduce((n, s) => n + s.points, 0)).toBe(2) // the opposition basket counts in no row
    // On the same game: the opposition basket does count in the score — the half of
    // the invariant an assertion on the rows alone does not protect.
    expect(liveState(m).score.b).toBe(3)
  })
})
