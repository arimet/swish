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
  it('ajoute un evenement de facon immuable', () => {
    const m = baseMatch()
    const m2 = appendEvent(m, ev({ type: 'PERIOD_START' }))
    expect(m.events).toHaveLength(0)
    expect(m2.events).toHaveLength(1)
  })
  it('refuse un SCORE si le chrono na jamais demarré sur la periode', () => {
    const m = baseMatch()
    expect(() =>
      appendEvent(m, ev({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3' } as Partial<GameEvent> & { type: 'SCORE' })),
    ).toThrow()
  })
  it('refuse aussi un MISS si le chrono na jamais demarré sur la periode', () => {
    const m = baseMatch()
    expect(() =>
      appendEvent(m, ev({ type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } } as Partial<GameEvent> & { type: 'MISS' })),
    ).toThrow()
  })
  it('refuse deux CLOCK_START consecutifs', () => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    expect(() => appendEvent(m, ev({ type: 'CLOCK_START' }))).toThrow()
  })
  it('refuse CLOCK_STOP si le chrono est deja arrete', () => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_STOP' }))
    expect(() => appendEvent(m, ev({ type: 'CLOCK_STOP' }))).toThrow()
  })
})

describe('undoLast', () => {
  it('retire le dernier evenement', () => {
    let m = baseMatch()
    m = appendEvent(m, ev({ type: 'PERIOD_START' }))
    m = appendEvent(m, ev({ type: 'CLOCK_START' }))
    const m2 = undoLast(m)
    expect(m2.events).toHaveLength(1)
    expect(m2.events[0].type).toBe('PERIOD_START')
  })
  it('undoLast sur journal vide ne casse pas', () => {
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
  it('retire le dernier evenement correspondant, pas les autres', () => {
    const m = removeLastEvent(scored(), (e) => e.type === 'SCORE' && e.playerId === 'p1')
    const scores = m.events.filter((e) => e.type === 'SCORE')
    expect(scores).toHaveLength(1)
    expect(scores[0].id).toBe('s1') // le plus récent (s2) a été retiré
  })
  it('ne retire quun seul evenement (la faute reste)', () => {
    const m = removeLastEvent(scored(), (e) => e.type === 'FOUL')
    expect(m.events.filter((e) => e.type === 'FOUL')).toHaveLength(0)
    expect(m.events.filter((e) => e.type === 'SCORE')).toHaveLength(2)
  })
  it('no-op (meme reference) si aucun evenement ne correspond', () => {
    const m = scored()
    expect(removeLastEvent(m, (e) => e.type === 'TIMEOUT')).toBe(m)
  })
})

describe('validateEvent', () => {
  it('retourne null pour PERIOD_START valide', () => {
    expect(validateEvent(baseMatch(), ev({ type: 'PERIOD_START' }))).toBeNull()
  })
})
