import { describe, expect, it } from 'vitest'
import { mergeMatches, furthest } from './merge'
import { undoLast, removeLastEvent } from './reducer'
import type { GameEvent, Match } from './types'

const basket = (id: string, wallClock: number): GameEvent =>
  ({ id, wallClock, period: 1, gameClock: 600 - wallClock, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' })

const match = (events: GameEvent[], reste: Partial<Match> = {}): Match =>
  ({ id: 'm1', meta: { clubId: 'ta', opponentId: 'tb' }, roster: ['p1'], status: 'live', events, ...reste })

/** The log's order, as ids — the only thing worth reading here. */
const journal = (m: Match) => m.events.map((e) => e.id)

describe('mergeMatches', () => {
  it('loses no basket when two devices score at the same time', () => {
    // The founding property: the loser of the arbitration is not wrong, it recorded
    // something else. Overwriting it would make baskets disappear.
    const scorer = match([basket('a', 10), basket('b', 20)])
    const coach = match([basket('a', 10), basket('c', 15)])

    expect(journal(mergeMatches(scorer, coach))).toEqual(['a', 'c', 'b'])
  })

  it('gives the same log whatever the order of arrival', () => {
    // Sans commutativité, deux miroirs divergeraient en affichant chacun un
    // a "correct" log — and the score would show two truths.
    const a = match([basket('a', 10), basket('b', 20)])
    const b = match([basket('c', 15), basket('d', 5)])

    expect(journal(mergeMatches(a, b))).toEqual(journal(mergeMatches(b, a)))
  })

  it('breaks a tie between two events at the same time on the id, not on arrival', () => {
    const a = match([basket('zzz', 10)])
    const b = match([basket('aaa', 10)])

    expect(journal(mergeMatches(a, b))).toEqual(['aaa', 'zzz'])
    expect(journal(mergeMatches(b, a))).toEqual(['aaa', 'zzz'])
  })

  it('a retraction wins over the other device\'s copy', () => {
    // The coach retracts basket "b". The scorer, who still has it, pushes their
    // version. Without the retractions, the union would resurrect it.
    const coach = undoLast(match([basket('a', 10), basket('b', 20)]))
    const scorer = match([basket('a', 10), basket('b', 20)])

    expect(journal(mergeMatches(scorer, coach))).toEqual(['a'])
    expect(journal(mergeMatches(coach, scorer))).toEqual(['a'])
  })

  it('a retracted event does not come back at the next flush', () => {
    // Second round: the scorer pushes their stale log again, against a server state
    // that already carries the retraction.
    const server = mergeMatches(match([basket('a', 10), basket('b', 20)]),
                                    undoLast(match([basket('a', 10), basket('b', 20)])))
    const lateScorer = match([basket('a', 10), basket('b', 20)])

    expect(journal(mergeMatches(server, lateScorer))).toEqual(['a'])
  })

  it('accumulates the retractions from both sides', () => {
    const coach = undoLast(match([basket('a', 10), basket('b', 20)]))
    const scorer = removeLastEvent(match([basket('a', 10), basket('c', 30)]), (e) => e.id === 'c')

    const f = mergeMatches(coach, scorer)
    expect(journal(f)).toEqual(['a'])
    expect(f.retracted?.sort()).toEqual(['b', 'c'])
  })

  it('the fields that replace come from the second — the one that won arbitration', () => {
    const ancien = match([], { meta: { clubId: 'ta', opponentId: 'tb', venue: 'ANCIEN' } })
    const recent = match([], { meta: { clubId: 'ta', opponentId: 'tb', venue: 'RÉCENT' } })

    expect(mergeMatches(ancien, recent).meta.venue).toBe('RÉCENT')
  })

  it('sets no `retracted` field when there is nothing to strike out', () => {
    // The document stays as it was before this work as long as nobody retracts:
    // nothing forces existing stores to gain an empty field.
    expect(mergeMatches(match([basket('a', 10)]), match([basket('a', 10)])))
      .not.toHaveProperty('retires')
  })
})

describe('the status never moves backwards', () => {
  it('a finished game does not reopen under a late queue', () => {
    // A device offline for an hour empties its queue carrying a stale `live`. A
    // reopened sheet suggests it can still be corrected.
    const server = match([], { status: 'finished' })
    const late = match([], { status: 'live' })

    expect(mergeMatches(server, late).status).toBe('finished')
  })

  it('but it advances when that is the direction of travel', () => {
    expect(mergeMatches(match([], { status: 'live' }), match([], { status: 'finished' })).status).toBe('finished')
    expect(furthest('setup', 'live')).toBe('live')
    expect(furthest('finished', 'setup')).toBe('finished')
  })
})

describe('the reducer records its retractions', () => {
  it('`undoLast` takes the event out of the log and keeps its id', () => {
    const m = undoLast(match([basket('a', 10), basket('b', 20)]))
    expect(journal(m)).toEqual(['a'])
    expect(m.retracted).toEqual(['b'])
  })

  it('`removeLastEvent` does the same for the one it removes', () => {
    const m = removeLastEvent(match([basket('a', 10), basket('b', 20)]), (e) => e.id === 'a')
    expect(journal(m)).toEqual(['b'])
    expect(m.retracted).toEqual(['a'])
  })

  it('invents no retraction when there is nothing to remove', () => {
    expect(undoLast(match([])).retracted).toBeUndefined()
    expect(removeLastEvent(match([basket('a', 10)]), () => false).retracted).toBeUndefined()
  })
})
