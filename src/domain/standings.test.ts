import { describe, expect, it } from 'vitest'
import { standings } from './standings'
import type { GameEvent, Match, ReportedResult, Team } from './types'

const TEAMS: Record<string, Team> = {
  a: { id: 'a', name: 'VIGNOT' }, b: { id: 'b', name: 'VERDUN' },
  c: { id: 'c', name: 'METZ' }, d: { id: 'd', name: 'NANCY' },
}

/** One of our games, finished, `pa` two-point baskets for us and `pb` for them. */
const notre = (id: string, opponentId: string, pa: number, pb: number, date = '2026-01-10', league = 'Poule A'): Match => {
  const evts: Partial<GameEvent>[] = [
    { type: 'CLOCK_START' },
    ...Array.from({ length: pa }, () => ({ type: 'SCORE' as const, team: 'A' as const, playerId: 'p1', kind: '2int' as const })),
    ...Array.from({ length: pb }, () => ({ type: 'SCORE' as const, team: 'B' as const, kind: '2int' as const })),
  ]
  return {
    id, meta: { championshipLabel: league, date, clubId: 'a', opponentId },
    roster: ['p1'], status: 'finished',
    events: evts.map((e, i) => ({ id: `${id}-${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
  }
}

const saisi = (id: string, homeId: string, awayId: string, hs: number, as_: number, date = '2026-01-10', league = 'Poule A'): ReportedResult =>
  ({ id, championshipLabel: league, date, homeId, awayId, homeScore: hs, awayScore: as_ })

describe('standings', () => {
  it('applies the scale: a win is 2 points, a loss 1', () => {
    const [table] = standings([notre('m1', 'b', 10, 5)], [], TEAMS)
    expect(table.league).toBe('Poule A')
    expect(table.lines.map((l) => [l.id, l.v, l.d, l.pts])).toEqual([['a', 1, 0, 2], ['b', 0, 1, 1]])
  })

  it('combines our games and the entered results', () => {
    const table = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'c', 'd', 70, 60)], TEAMS)[0]
    expect(table.lines.map((l) => l.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(table.lines.find((l) => l.id === 'c')!.pts).toBe(2)
    expect(table.lines.find((l) => l.id === 'd')!.pts).toBe(1)
  })

  it('ignores an entered result that duplicates one of our games', () => {
    // Same league, same teams, same date: our own game is authoritative.
    const table = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'a', 'b', 99, 1)], TEAMS)[0]
    const nous = table.lines.find((l) => l.id === 'a')!
    expect(nous.j).toBe(1)
    expect(nous.pf).toBe(20) // our real score, not the 99 copied in
  })

  it('ignores the duplicate whichever way round home and away are', () => {
    const table = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'b', 'a', 1, 99)], TEAMS)[0]
    expect(table.lines.find((l) => l.id === 'a')!.j).toBe(1)
  })

  it('separates the leagues', () => {
    const tables = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'c', 'd', 70, 60, '2026-01-10', 'Coupe')], TEAMS)
    expect(tables.map((t) => t.league).sort()).toEqual(['Coupe', 'Poule A'])
  })

  it('breaks a tie on points by the differential', () => {
    const table = standings([], [saisi('r1', 'a', 'b', 30, 10), saisi('r2', 'c', 'd', 22, 20)], TEAMS)[0]
    expect(table.lines.slice(0, 2).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('ignores our unfinished games', () => {
    const m = { ...notre('m1', 'b', 10, 5), status: 'live' as const }
    expect(standings([m], [], TEAMS)).toEqual([])
  })
})
