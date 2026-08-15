import { describe, expect, it } from 'vitest'
import { appendEvent, undoLast, removeLastEvent, validateEvent } from './reducer'
import type { Match, GameEvent } from './types'

const baseMatch = (): Match => ({
  id: 'm1',
  meta: { championshipLabel: 'PRM', clubId: 'ta', opponentId: 'tb' },
  roster: ['p1'],
  events: [],
  status: 'live',
})
const ev = (e: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent =>
  ({ id: 'e', wallClock: 0, period: 1, gameClock: 600, ...e } as GameEvent)

describe('appendEvent', () => {
  it('adds an event immutably', () => {
    const m = baseMatch()
    const m2 = appendEvent(m, ev({ type: 'PERIOD_START' }))
    expect(m.events).toHaveLength(0)
    expect(m2.events).toHaveLength(1)
  })
  it('refuses a SCORE if the clock never started in the period', () => {
    const m = baseMatch()
    expect(() =>
      appendEvent(m, ev({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3' } as Partial<GameEvent> & { type: 'SCORE' })),
    ).toThrow()
  })
  it('also refuses a MISS if the clock never started in the period', () => {
    const m = baseMatch()
    expect(() =>
      appendEvent(m, ev({ type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } } as Partial<GameEvent> & { type: 'MISS' })),
    ).toThrow()
  })
  it('refuses two consecutive CLOCK_STARTs', () => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    expect(() => appendEvent(m, ev({ type: 'CLOCK_START' }))).toThrow()
  })
  it('refuses CLOCK_STOP if the clock is already stopped', () => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_STOP' }))
    expect(() => appendEvent(m, ev({ type: 'CLOCK_STOP' }))).toThrow()
  })
})

describe('undoLast', () => {
  it('removes the last event', () => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    const m2 = undoLast(m)
    expect(m2.events).toHaveLength(1)
    expect(m2.events[0].type).toBe('PERIOD_START')
  })
  it('undoLast on an empty log does not break', () => {
    expect(undoLast(baseMatch()).events).toHaveLength(0)
  })
})

describe('removeLastEvent', () => {
  const scored = (): Match => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    m = appendEvent(m, ev({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', id: 's1' } as Partial<GameEvent> & { type: 'SCORE' }))
    m = appendEvent(m, ev({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' } as Partial<GameEvent> & { type: 'FOUL' }))
    m = appendEvent(m, ev({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', id: 's2' } as Partial<GameEvent> & { type: 'SCORE' }))
    return m
  }
  it('removes the last matching event, not the others', () => {
    const m = removeLastEvent(scored(), (e) => e.type === 'SCORE' && e.playerId === 'p1')
    const scores = m.events.filter((e) => e.type === 'SCORE')
    expect(scores).toHaveLength(1)
    expect(scores[0].id).toBe('s1') // the most recent (s2) was removed
  })
  it('removes only one event (the foul stays)', () => {
    const m = removeLastEvent(scored(), (e) => e.type === 'FOUL')
    expect(m.events.filter((e) => e.type === 'FOUL')).toHaveLength(0)
    expect(m.events.filter((e) => e.type === 'SCORE')).toHaveLength(2)
  })
  it('no-op (same reference) when no event matches', () => {
    const m = scored()
    expect(removeLastEvent(m, (e) => e.type === 'TIMEOUT')).toBe(m)
  })
})

describe('validateEvent', () => {
  it('returns null for a valid PERIOD_START', () => {
    expect(validateEvent(baseMatch(), ev({ type: 'PERIOD_START' }))).toBeNull()
  })
})
