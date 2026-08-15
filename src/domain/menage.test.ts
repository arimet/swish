import { describe, expect, it } from 'vitest'
import { years, hasEvents, leagues, clubsDesRencontres, ofYear, ofLeague } from './menage'
import type { GameEvent, Match } from './types'

const ev: GameEvent = { id: 'e1', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 }

const m = (id: string, champ: string | undefined, date: string | undefined, clubId = 'ta', events: GameEvent[] = []): Match => ({
  id, meta: { championshipLabel: champ, date, clubId, opponentId: 'tb' }, roster: [], events, status: 'setup',
})

describe('ménage — périmètres déduits des rencontres', () => {
  it('déduit les championnats des rencontres, sans doublon et triés', () => {
    const liste = leagues([m('m1', 'Poule B', '2026-01-10'), m('m2', 'Poule A', '2026-01-17'), m('m3', 'Poule A', '2026-01-24')])
    expect(liste).toEqual(['Poule A', 'Poule B'])
  })

  it('range une rencontre sans championnat sous « Match amical », comme partout ailleurs', () => {
    expect(leagues([m('m1', undefined, '2026-01-10')])).toEqual(['Match amical'])
  })

  it('déduit les années civiles des dates, de la plus récente à la plus ancienne', () => {
    expect(years([m('m1', 'A', '2025-11-08'), m('m2', 'A', '2026-01-17'), m('m3', 'A', '2026-02-01')])).toEqual(['2026', '2025'])
  })

  it('ignore les rencontres sans date : elles n’appartiennent à aucune année', () => {
    const sansDate = [m('m1', 'A', undefined), m('m2', 'A', '2026-01-17')]
    expect(years(sansDate)).toEqual(['2026'])
    expect(sansDate.filter(ofYear('2026')).map((x) => x.id)).toEqual(['m2'])
  })

  it('cadre le filtre par championnat sur le seul championnat visé', () => {
    const tous = [m('m1', 'Poule A', '2026-01-10'), m('m2', 'Poule B', '2026-01-10')]
    expect(tous.filter(ofLeague('Poule A')).map((x) => x.id)).toEqual(['m1'])
  })

  it('ne propose au vidage que les clubs qui ont des rencontres, jamais l’adversaire', () => {
    expect(clubsDesRencontres([m('m1', 'A', '2026-01-10', 'ta'), m('m2', 'A', '2026-01-17', 'ta')])).toEqual(['ta'])
  })

  it('ne compte comme feuille à vider qu’une rencontre du club qui porte des évènements', () => {
    const tous = [
      m('vierge', 'A', '2026-01-10', 'ta'),
      m('remplie', 'A', '2026-01-17', 'ta', [ev]),
      m('autre-club', 'A', '2026-01-17', 'tz', [ev]),
    ]
    expect(tous.filter(hasEvents('ta')).map((x) => x.id)).toEqual(['remplie'])
  })
})
