/**
 * Setting a cell of the match sheet outright, after the game.
 *
 * The sheet is read from the events and nothing else, so a correction cannot write a
 * number: it writes the events that add up to that number. Asking for four free throws
 * where three are recorded appends one; asking for one removes two — the last two, so
 * that a shot recorded with its position on the court survives an earlier one being
 * taken away.
 *
 * It is one function rather than a loop of `addScore` / `removeScoreKind` at the call
 * site because a cell is corrected in one gesture: nine keystrokes on a row must not
 * be nine writes racing each other to the store.
 */
import { newId } from './ids'
import { removeLastEvent } from './reducer'
import type { GameEvent, Match, Period, ScoreKind, StatKind } from './types'

/**
 * A column of the sheet a number can be typed into: the raw counters, and nothing
 * derived. Points, field goals and the percentage fall out of these — offering them
 * for edit would be offering two ways to say the same thing, and no way to say which
 * of the two won.
 */
export type Cell = ScoreKind | StatKind | 'foul'

const SCORE_KINDS: ScoreKind[] = ['2int', '2ext', '3', 'lf']

/** Only our roster (side A) is detailed: the opposition has no players recorded. */
function matches(playerId: string, cell: Cell) {
  return (e: GameEvent): boolean => {
    if (cell === 'foul') return e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player' && e.target.playerId === playerId
    if (SCORE_KINDS.includes(cell as ScoreKind)) return e.type === 'SCORE' && e.team === 'A' && e.playerId === playerId && e.kind === cell
    return e.type === 'STAT' && e.team === 'A' && e.playerId === playerId && e.stat === cell
  }
}

/** What the sheet shows in that cell today. */
export const countIn = (match: Match, playerId: string, cell: Cell): number =>
  match.events.filter(matches(playerId, cell)).length

/**
 * The event a correction appends. The clock is zero and the period the one the match
 * ended in: a stat corrected on Monday did not happen at a minute of the game, and
 * pretending otherwise would put a false point on the progression chart. A foul added
 * this way is `personal` — the untyped one — because the typed distinction is a call
 * made at the table, not something to be guessed a week later.
 */
function made(playerId: string, cell: Cell, period: Period): GameEvent {
  const base = { id: newId(), wallClock: Date.now(), period, gameClock: 0, team: 'A' as const }
  if (cell === 'foul') return { ...base, type: 'FOUL', target: { kind: 'player', playerId }, foulType: 'personal' }
  if (SCORE_KINDS.includes(cell as ScoreKind)) return { ...base, type: 'SCORE', playerId, kind: cell as ScoreKind }
  return { ...base, type: 'STAT', playerId, stat: cell as StatKind }
}

/**
 * The match with that cell brought to `n`. Returns the same match untouched when the
 * number asked for is the number already there, or is not a number at all — a cell
 * left empty, or holding a minus sign mid-typing, must not empty the row.
 */
export function setCount(match: Match, playerId: string, cell: Cell, n: number, period: Period): Match {
  if (!Number.isFinite(n)) return match
  const target = Math.max(0, Math.floor(n))
  const pred = matches(playerId, cell)
  let next = match
  let count = countIn(match, playerId, cell)
  while (count > target) { next = removeLastEvent(next, pred); count-- }
  if (count === target) return next
  const added: GameEvent[] = []
  for (; count < target; count++) added.push(made(playerId, cell, period))
  return { ...next, events: [...next.events, ...added] }
}
