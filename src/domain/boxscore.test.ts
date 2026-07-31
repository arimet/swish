import { describe, expect, it } from 'vitest'
import { playerStats, pointsForKind } from './boxscore'
import type { Match, GameEvent } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', teamAId: 'a', teamBId: 'b' },
  roster: { A: ['p1', 'p2'], B: ['q1'] }, status: 'live',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

describe('pointsForKind', () => {
  it('mappe les types de tir vers leurs points', () => {
    expect(pointsForKind('lf')).toBe(1)
    expect(pointsForKind('2int')).toBe(2)
    expect(pointsForKind('2ext')).toBe(2)
    expect(pointsForKind('3')).toBe(3)
  })
})

describe('playerStats', () => {
  it('agrège les tirs et applique la formule confirmée (cas MILAS: 8 tirs, 21 pts)', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'CLOCK_START' },
      ...Array(1).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3' }),
      ...Array(5).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' }),
      ...Array(2).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2ext' }),
      ...Array(4).fill({ type: 'SCORE', team: 'A', playerId: 'p1', kind: 'lf' }),
    ]
    const p1 = playerStats(mk(events), 'A').find((s) => s.playerId === 'p1')!
    expect(p1.threes).toBe(1)
    expect(p1.twoInside).toBe(5)
    expect(p1.twoOutside).toBe(2)
    expect(p1.freeThrows).toBe(4)
    expect(p1.fieldGoalsMade).toBe(8) // 1 + 5 + 2
    expect(p1.points).toBe(21)        // 3 + 10 + 4 + 4
  })
  it('compte les fautes du joueur', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' },
      { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'technical' },
    ]
    const p1 = playerStats(mk(events), 'A').find((s) => s.playerId === 'p1')!
    expect(p1.fouls).toBe(2)
  })
  it('marque les titulaires depuis STARTING_FIVE', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
    ]
    const stats = playerStats(mk(events), 'A')
    expect(stats.find((s) => s.playerId === 'p1')!.isStarter).toBe(true)
    expect(stats.find((s) => s.playerId === 'p2')!.isStarter).toBe(false)
  })
  it('retourne une ligne par joueur du roster, ordre préservé', () => {
    expect(playerStats(mk([]), 'A').map((s) => s.playerId)).toEqual(['p1', 'p2'])
  })
  it('agrège passes décisives, rebonds off/déf et contres', () => {
    const events: Partial<GameEvent>[] = [
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'reb_off' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'reb_def' },
      { type: 'STAT', team: 'A', playerId: 'p1', stat: 'block' },
      { type: 'STAT', team: 'B', playerId: 'q1', stat: 'assist' }, // autre équipe, ignoré côté A
    ]
    const p1 = playerStats(mk(events), 'A').find((s) => s.playerId === 'p1')!
    expect(p1).toMatchObject({ assists: 2, offRebounds: 1, defRebounds: 1, blocks: 1 })
  })
})
