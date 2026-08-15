import { describe, expect, it } from 'vitest'
import { years, hasEvents, leagues, clubsOfGames, ofYear, ofLeague } from './menage'
import type { GameEvent, Match } from './types'

const ev: GameEvent = { id: 'e1', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 }

const m = (id: string, champ: string | undefined, date: string | undefined, clubId = 'ta', events: GameEvent[] = []): Match => ({
  id, meta: { championshipLabel: champ, date, clubId, opponentId: 'tb' }, roster: [], events, status: 'setup',
})

describe('cleanup — scopes derived from the games', () => {
  it('derives the leagues from the games, deduplicated and sorted', () => {
    const liste = leagues([m('m1', 'Poule B', '2026-01-10'), m('m2', 'Poule A', '2026-01-17'), m('m3', 'Poule A', '2026-01-24')])
    expect(liste).toEqual(['Poule A', 'Poule B'])
  })

  it('files a game with no league under « Match amical », as everywhere else', () => {
    expect(leagues([m('m1', undefined, '2026-01-10')])).toEqual(['Match amical'])
  })

  it('derives the calendar years from the dates, most recent first', () => {
    expect(years([m('m1', 'A', '2025-11-08'), m('m2', 'A', '2026-01-17'), m('m3', 'A', '2026-02-01')])).toEqual(['2026', '2025'])
  })

  it('ignores games with no date: they belong to no year', () => {
    const sansDate = [m('m1', 'A', undefined), m('m2', 'A', '2026-01-17')]
    expect(years(sansDate)).toEqual(['2026'])
    expect(sansDate.filter(ofYear('2026')).map((x) => x.id)).toEqual(['m2'])
  })

  it('frames the league filter on the targeted league alone', () => {
    const tous = [m('m1', 'Poule A', '2026-01-10'), m('m2', 'Poule B', '2026-01-10')]
    expect(tous.filter(ofLeague('Poule A')).map((x) => x.id)).toEqual(['m1'])
  })

  it('offers for emptying only the clubs that have games, never the opposition', () => {
    expect(clubsOfGames([m('m1', 'A', '2026-01-10', 'ta'), m('m2', 'A', '2026-01-17', 'ta')])).toEqual(['ta'])
  })

  it('counts as a sheet to empty only a game of the club that carries events', () => {
    const tous = [
      m('vierge', 'A', '2026-01-10', 'ta'),
      m('remplie', 'A', '2026-01-17', 'ta', [ev]),
      m('autre-club', 'A', '2026-01-17', 'tz', [ev]),
    ]
    expect(tous.filter(hasEvents('ta')).map((x) => x.id)).toEqual(['remplie'])
  })
})
