import { describe, expect, it } from 'vitest'
import { countIn, setCount } from './correct'
import { playerStats } from './boxscore'
import type { GameEvent, Match } from './types'

const mk = (events: Partial<GameEvent>[]): Match => ({
  id: 'm', meta: { championshipLabel: 'x', clubId: 'a', opponentId: 'b' },
  roster: ['p1', 'p2'], status: 'finished',
  events: events.map((e, i) => ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

const three = { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3' } as const
const foul = { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' } as const

describe('setCount — typing a number into a cell of the sheet', () => {
  it('appends the events missing to reach the number asked for', () => {
    const next = setCount(mk([three]), 'p1', '3', 4, 4)
    expect(countIn(next, 'p1', '3')).toBe(4)
    // The sheet is read from the events: the derived columns follow on their own.
    const p1 = playerStats(next).find((s) => s.playerId === 'p1')!
    expect(p1.points).toBe(12)
    expect(p1.fieldGoalsMade).toBe(4)
  })

  it('removes the last events when the number goes down, keeping the earliest', () => {
    // The first three carries a position on the court; the two typed afterwards do
    // not. Coming back down to one must keep the located one.
    const located = { ...three, shot: { x: 0.2, y: 0.3 } }
    const next = setCount(mk([located, three, three]), 'p1', '3', 1, 4)
    expect(next.events).toHaveLength(1)
    expect(next.events[0]).toMatchObject({ shot: { x: 0.2, y: 0.3 } })
  })

  it('empties a cell at zero and never goes below it', () => {
    expect(countIn(setCount(mk([three, three]), 'p1', '3', 0, 4), 'p1', '3')).toBe(0)
    expect(countIn(setCount(mk([three]), 'p1', '3', -5, 4), 'p1', '3')).toBe(0)
  })

  it('leaves the match untouched when nothing is asked', () => {
    const match = mk([three])
    expect(setCount(match, 'p1', '3', 1, 4)).toBe(match)
    // A cell being emptied mid-typing reads as NaN. It must not wipe the row.
    expect(setCount(match, 'p1', '3', NaN, 4)).toBe(match)
  })

  it('touches only the player and the column addressed', () => {
    const other = { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3' } as const
    const assist = { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' } as const
    const next = setCount(mk([three, other, assist]), 'p1', '3', 0, 4)
    expect(countIn(next, 'p2', '3')).toBe(1)
    expect(countIn(next, 'p1', 'assist')).toBe(1)
  })

  it('counts and corrects fouls, stats and free throws alike', () => {
    let match = mk([foul])
    match = setCount(match, 'p1', 'foul', 3, 4)
    match = setCount(match, 'p1', 'lf', 2, 4)
    match = setCount(match, 'p1', 'reb_def', 5, 4)
    const p1 = playerStats(match).find((s) => s.playerId === 'p1')!
    expect(p1.fouls).toBe(3)
    expect(p1.freeThrows).toBe(2)
    expect(p1.defRebounds).toBe(5)
  })

  it('stamps the added events with the period given, at clock zero', () => {
    // A correction made after the game did not happen at a minute of it: writing a
    // running clock would plant a false point on the progression chart.
    const added = setCount(mk([]), 'p1', '2int', 1, 4).events[0]
    expect(added).toMatchObject({ period: 4, gameClock: 0, team: 'A' })
  })
})
