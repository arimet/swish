import { describe, expect, it } from 'vitest'
import { shootingPct, shotsOf, zoneSummary } from './shotchart'
import type { GameEvent, Match } from './types'

const mk = (id: string, events: Partial<GameEvent>[]): Match => ({
  id, meta: { championshipLabel: 'x', teamAId: 'a', teamBId: 'b' },
  roster: { A: ['p1', 'p2'], B: [] }, status: 'finished',
  events: events.map((e, i) => ({ id: `${id}-e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

const TOP3 = { x: 0.5, y: 0.65 }
const PAINT = { x: 0.5, y: 0.15 }

describe('shotsOf', () => {
  it('rassemble les tirs d\'un joueur sur plusieurs matchs', () => {
    const shots = shotsOf([
      mk('m1', [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]),
      mk('m2', [{ type: 'MISS', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT }]),
    ], 'p1')
    expect(shots).toHaveLength(2)
    expect(shots.map((s) => s.zone)).toEqual(['top3', 'paint'])
    expect(shots.map((s) => s.made)).toEqual([true, false])
    expect(shots.map((s) => s.matchId)).toEqual(['m1', 'm2'])
  })

  it('exclut les tirs des autres joueurs', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3', shot: TOP3 },
    ])
    expect(shotsOf([m], 'p1')).toHaveLength(1)
  })

  it('exclut les lancers francs et les paniers sans position', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: 'lf' },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' }, // raccourci sans position
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    ])
    expect(shotsOf([m], 'p1')).toHaveLength(1)
  })
})

describe('zoneSummary', () => {
  it('cumule réussis et tentatives par zone, à zéro partout ailleurs', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
    ])
    const sum = zoneSummary(shotsOf([m], 'p1'))
    expect(sum.top3).toEqual({ made: 1, attempts: 2 })
    expect(sum.paint).toEqual({ made: 1, attempts: 1 })
    expect(sum.corner3_left).toEqual({ made: 0, attempts: 0 })
  })
})

describe('shootingPct', () => {
  it('calcule la réussite globale et à 3 points', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
    ])
    expect(shootingPct(shotsOf([m], 'p1'))).toEqual({ fg: 75, three: 50 })
  })

  it('renvoie null plutôt que zéro quand il n\'y a aucun tir', () => {
    expect(shootingPct([])).toEqual({ fg: null, three: null })
  })
})
