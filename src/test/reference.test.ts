import { describe, expect, it } from 'vitest'
import { referenceMatch } from './fixtures/referenceMatch'
import { playerStats } from '../domain/boxscore'
import { teamTotals } from '../domain/totals'

describe('the reference game (VIGNOT-1 vs BCV VERDUN)', () => {
  it('reproduces the MILAS line: 21 pts, 8 made shots', () => {
    const milas = playerStats(referenceMatch()).find((s) => s.playerId === 'milas')!
    expect(milas.points).toBe(21)
    expect(milas.fieldGoalsMade).toBe(8)
    expect(milas.threes).toBe(1)
    expect(milas.twoInside).toBe(5)
    expect(milas.twoOutside).toBe(2)
    expect(milas.freeThrows).toBe(4)
  })
  it('the team totals satisfy shots = 2in + 2out + 3', () => {
    const t = teamTotals(referenceMatch()).team
    expect(t.fieldGoalsMade).toBe(t.twoInside + t.twoOutside + t.threes)
    expect(t.points).toBe(2 * t.twoInside + 2 * t.twoOutside + 3 * t.threes + t.freeThrows)
  })
})
