import { describe, expect, it } from 'vitest'
import { standings } from './standings'
import type { GameEvent, Match, ReportedResult, Team } from './types'

const TEAMS: Record<string, Team> = {
  a: { id: 'a', name: 'VIGNOT' }, b: { id: 'b', name: 'VERDUN' },
  c: { id: 'c', name: 'METZ' }, d: { id: 'd', name: 'NANCY' },
}

/** Une de nos rencontres, terminée, `pa` paniers à 2 pts pour nous et `pb` pour eux. */
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
  it('applique le barème : victoire 2 points, défaite 1 point', () => {
    const [table] = standings([notre('m1', 'b', 10, 5)], [], TEAMS)
    expect(table.league).toBe('Poule A')
    expect(table.lines.map((l) => [l.id, l.v, l.d, l.pts])).toEqual([['a', 1, 0, 2], ['b', 0, 1, 1]])
  })

  it('combine nos rencontres et les résultats saisis', () => {
    const table = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'c', 'd', 70, 60)], TEAMS)[0]
    expect(table.lines.map((l) => l.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(table.lines.find((l) => l.id === 'c')!.pts).toBe(2)
    expect(table.lines.find((l) => l.id === 'd')!.pts).toBe(1)
  })

  it('ignore un résultat saisi qui fait doublon avec une de nos rencontres', () => {
    // Même championnat, mêmes équipes, même date : c'est notre rencontre qui fait foi.
    const table = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'a', 'b', 99, 1)], TEAMS)[0]
    const nous = table.lines.find((l) => l.id === 'a')!
    expect(nous.j).toBe(1)
    expect(nous.pf).toBe(20) // notre score réel, pas le 99 recopié
  })

  it('ignore le doublon quel que soit le sens domicile/extérieur', () => {
    const table = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'b', 'a', 1, 99)], TEAMS)[0]
    expect(table.lines.find((l) => l.id === 'a')!.j).toBe(1)
  })

  it('sépare les championnats', () => {
    const tables = standings([notre('m1', 'b', 10, 5)], [saisi('r1', 'c', 'd', 70, 60, '2026-01-10', 'Coupe')], TEAMS)
    expect(tables.map((t) => t.league).sort()).toEqual(['Coupe', 'Poule A'])
  })

  it('départage à égalité de points par la différence', () => {
    const table = standings([], [saisi('r1', 'a', 'b', 30, 10), saisi('r2', 'c', 'd', 22, 20)], TEAMS)[0]
    expect(table.lines.slice(0, 2).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('ignore nos rencontres non terminées', () => {
    const m = { ...notre('m1', 'b', 10, 5), status: 'live' as const }
    expect(standings([m], [], TEAMS)).toEqual([])
  })
})
