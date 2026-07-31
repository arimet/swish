import { describe, expect, it } from 'vitest'
import { referenceMatch } from './fixtures/referenceMatch'
import { playerStats } from '../domain/boxscore'
import { teamTotals } from '../domain/totals'

describe('match de référence (VIGNOT-1 vs BCV VERDUN)', () => {
  it('reproduit la ligne MILAS : 21 pts, 8 tirs réussis', () => {
    const milas = playerStats(referenceMatch(), 'A').find((s) => s.playerId === 'milas')!
    expect(milas.points).toBe(21)
    expect(milas.fieldGoalsMade).toBe(8)
    expect(milas.threes).toBe(1)
    expect(milas.twoInside).toBe(5)
    expect(milas.twoOutside).toBe(2)
    expect(milas.freeThrows).toBe(4)
  })
  it('les totaux équipe respectent Tirs = 2int + 2ext + 3', () => {
    const t = teamTotals(referenceMatch(), 'A').team
    expect(t.fieldGoalsMade).toBe(t.twoInside + t.twoOutside + t.threes)
    expect(t.points).toBe(2 * t.twoInside + 2 * t.twoOutside + 3 * t.threes + t.freeThrows)
  })
})
