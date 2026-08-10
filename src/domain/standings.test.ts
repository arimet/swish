import { describe, expect, it } from 'vitest'
import { clubStanding, standings } from './standings'
import type { GameEvent, Match, Team } from './types'

const TEAMS: Record<string, Team> = {
  a: { id: 'a', name: 'VIGNOT' }, b: { id: 'b', name: 'VERDUN' }, c: { id: 'c', name: 'METZ' },
}

/** Rencontre terminée : `pa` paniers à 2 pts pour A, `pb` pour B. */
const mk = (id: string, teamAId: string, teamBId: string, pa: number, pb: number, champ = 'Poule A'): Match => {
  const events: GameEvent[] = [{ id: `${id}-c`, wallClock: 0, period: 1, gameClock: 600, type: 'CLOCK_START' }]
  for (let i = 0; i < pa; i++) events.push({ id: `${id}-a${i}`, wallClock: i, period: 1, gameClock: 500, type: 'SCORE', team: 'A', playerId: 'p', kind: '2int' })
  for (let i = 0; i < pb; i++) events.push({ id: `${id}-b${i}`, wallClock: 100 + i, period: 1, gameClock: 400, type: 'SCORE', team: 'B', playerId: 'q', kind: '2int' })
  return { id, meta: { championshipLabel: champ, teamAId, teamBId }, roster: { A: [], B: [] }, events, status: 'finished' }
}

describe('standings', () => {
  it('applique le barème : victoire 2 points, défaite 1 point', () => {
    const [table] = standings([mk('m1', 'a', 'b', 10, 5)], TEAMS)
    expect(table.champ).toBe('Poule A')
    expect(table.lines.map((l) => [l.id, l.v, l.d, l.pts])).toEqual([['a', 1, 0, 2], ['b', 0, 1, 1]])
  })

  it('départage à égalité de points par la différence de points', () => {
    const [table] = standings([mk('m1', 'a', 'b', 10, 5), mk('m2', 'c', 'b', 4, 2)], TEAMS)
    // a et c gagnent chacun : 2 pts, mais a a +10 de différence contre +4 pour c.
    expect(table.lines.slice(0, 2).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('ignore les rencontres non terminées', () => {
    const m = { ...mk('m1', 'a', 'b', 10, 5), status: 'live' as const }
    expect(standings([m], TEAMS)).toEqual([])
  })

  it('sépare les championnats', () => {
    const tables = standings([mk('m1', 'a', 'b', 10, 5), mk('m2', 'a', 'c', 6, 4, 'Coupe')], TEAMS)
    expect(tables.map((t) => t.champ).sort()).toEqual(['Coupe', 'Poule A'])
  })
})

describe('clubStanding', () => {
  it('donne la place du club dans son championnat', () => {
    // Avec le barème (victoire 2 pts, défaite 1 pt), une défaite compte aussi :
    // `a` doit perdre moins souvent que `c` gagne pour que `c` le devance vraiment.
    const ms = [mk('m1', 'a', 'b', 10, 5), mk('m2', 'c', 'a', 20, 2), mk('m3', 'c', 'b', 15, 3)]
    const s = clubStanding(ms, TEAMS, 'a')
    expect(s).not.toBeNull()
    expect(s!.rank).toBe(2) // c cumule deux victoires, a une victoire et une défaite : c premier, a deuxième
    expect(s!.total).toBe(3)
    expect(s!.line.id).toBe('a')
  })

  it('renvoie null sans rencontre terminée', () => {
    expect(clubStanding([], TEAMS, 'a')).toBeNull()
  })
})
