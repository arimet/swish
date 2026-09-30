import { describe, expect, it } from 'vitest'
import { diffEvents } from './sync'
import type { GameEvent } from './types'

const ev = (id: string): GameEvent => ({ id, type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })

describe('diffEvents', () => {
  it('names the events added and the ids gone', () => {
    expect(diffEvents([ev('a'), ev('b')], [ev('a'), ev('c')])).toEqual({ add: [ev('c')], archive: ['b'] })
    expect(diffEvents([], [])).toEqual({ add: [], archive: [] })
  })
})
