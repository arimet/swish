import { describe, expect, it } from 'vitest'
import { diffEvents, mergeSheet, NO_PENDING, revertWrite, track, untrack } from './sync'
import type { GameEvent, Match } from './types'

const ev = (id: string): GameEvent => ({ id, type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })

describe('diffEvents', () => {
  it('names the events added and the ids gone', () => {
    expect(diffEvents([ev('a'), ev('b')], [ev('a'), ev('c')])).toEqual({ add: [ev('c')], archive: ['b'] })
    expect(diffEvents([], [])).toEqual({ add: [], archive: [] })
  })
})

const sheet = (...ids: string[]): Match => ({ id: 'm', meta: { clubId: 'a', opponentId: 'b' }, roster: [], status: 'live', events: ids.map(ev) })
const ids = (m: Match) => m.events.map((e) => e.id)

describe('mergeSheet', () => {
  it('lays the events not yet acknowledged over the server\'s, and hides the ones being archived', () => {
    const p = track(track(NO_PENDING, [ev('mine')], []), [], ['a'])
    const { match, pending } = mergeSheet(sheet('a', 'b'), p)
    expect(ids(match)).toEqual(['b', 'mine'])
    expect(pending).toEqual(p)
  })

  it('forgets an added event once the server shows it, and keeps the archived ids hidden', () => {
    const p = track(NO_PENDING, [ev('mine')], ['a'])
    const { match, pending } = mergeSheet(sheet('b', 'mine'), p)
    expect(ids(match)).toEqual(['b', 'mine'])
    expect(pending).toEqual({ added: [], archived: ['a'] })
  })

  it('an undo of an event not yet acknowledged cancels it locally', () => {
    const p = track(track(NO_PENDING, [ev('mine')], []), [], ['mine'])
    // The add has not landed yet, then it has but the archive has not: two messages in a row.
    const first = mergeSheet(sheet('a'), p)
    expect(ids(first.match)).toEqual(['a'])
    expect(ids(mergeSheet(sheet('a', 'mine'), first.pending).match)).toEqual(['a'])
  })

  it('untrack drops a failed write', () => {
    const p = track(NO_PENDING, [ev('x')], ['a'])
    expect(untrack(p, [ev('x')], ['a'])).toEqual(NO_PENDING)
  })
})

describe('revertWrite', () => {
  it('removes only the events that failed, even with others added since', () => {
    const previous = sheet('a')
    const current = sheet('a', 'failed', 'later')
    expect(ids(revertWrite(current, previous, sheet('a', 'failed'), [ev('failed')], []))).toEqual(['a', 'later'])
  })

  it('puts an archived event back where it was', () => {
    const previous = sheet('a', 'b', 'c')
    expect(ids(revertWrite(sheet('a', 'c', 'later'), previous, sheet('a', 'c'), [], ['b']))).toEqual(['a', 'b', 'c', 'later'])
  })

  it('restores the head when the failed write changed it', () => {
    const previous = sheet('a')
    const next: Match = { ...previous, status: 'finished' }
    expect(revertWrite(next, previous, next, [], []).status).toBe('live')
  })

  it('keeps a head change from elsewhere when the failed write was only events', () => {
    const previous = sheet('a')
    const next = sheet('a', 'failed')
    const current: Match = { ...next, status: 'finished' }
    const reverted = revertWrite(current, previous, next, [ev('failed')], [])
    expect(reverted.status).toBe('finished')
    expect(ids(reverted)).toEqual(['a'])
  })
})
