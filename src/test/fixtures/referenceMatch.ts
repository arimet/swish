import { newId } from '../../domain/ids'
import type { GameEvent, Match, ScoreKind } from '../../domain/types'

// Reproduces the MILAS line (no. 20): 1×3pt, 5×2in, 2×2out, 4×FT → 21 pts, 8 shots.
const scores: ScoreKind[] = ['3', '2int', '2int', '2int', '2int', '2int', '2ext', '2ext', 'lf', 'lf', 'lf', 'lf']

export function referenceMatch(): Match {
  const events: GameEvent[] = [
    { id: newId(), type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 },
    { id: newId(), type: 'CLOCK_START', wallClock: 1, period: 1, gameClock: 600 },
    ...scores.map<GameEvent>((kind, i) => ({
      id: newId(), type: 'SCORE', wallClock: 2 + i, period: 1, gameClock: 590 - i,
      team: 'A', playerId: 'milas', kind,
    })),
  ]
  return {
    id: 'ref', meta: { championshipLabel: 'Pré régionale masculine', matchNumber: '78', clubId: 'ta', opponentId: 'tb' },
    roster: ['milas'], events, status: 'finished',
  }
}
