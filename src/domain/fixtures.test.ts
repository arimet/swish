import { describe, expect, it } from 'vitest'
import { since, nextFixture } from './fixtures'
import type { Match, Training } from './types'

const match = (id: string, date: string): Match => ({
  id, meta: { championshipLabel: 'Poule A', date, clubId: 'ta', opponentId: 'tb' },
  roster: [], events: [], status: 'setup',
})
const training = (id: string, date: string): Training => ({ id, date, clubId: 'ta' })

describe('nextFixture', () => {
  it('picks the first upcoming fixture', () => {
    const f = nextFixture([match('m1', '2026-02-07')], [training('e1', '2026-02-03')], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'training', id: 'e1' })
  })

  it('never picks a past fixture', () => {
    const f = nextFixture([match('m1', '2026-01-10')], [training('e1', '2026-01-05')], new Date('2026-02-01'))
    expect(f).toBeNull()
  })

  it('keeps today itself', () => {
    // On the morning of a game, today's fixture is the one that counts.
    const f = nextFixture([match('m1', '2026-02-01')], [], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('uses the local day, not the UTC day', () => {
    // 00:30 local time on 3 February: in UTC, depending on the offset, it may still
    // be the 2nd. The day kept must stay the 3rd (local components), otherwise the
    // 2nd's fixture — already past for the user — would pass the filter again.
    const dawn = new Date(2026, 1, 3, 0, 30)
    expect(nextFixture([match('m1', '2026-02-02')], [], dawn)).toBeNull()
    expect(nextFixture([match('m1', '2026-02-03')], [], dawn)).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('on an equal date, the game comes before the training', () => {
    const f = nextFixture([match('m1', '2026-02-03')], [training('e1', '2026-02-03')], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('between two games on the same date, keeps the first by insertion order', () => {
    // A comparator that only looked at a.kind (never b.kind) would be inconsistent
    // between two fixtures of the same nature: cmp(a,b) and cmp(b,a) would both return
    // -1. The sort being stable, insertion order must decide, in a way
    // déterministe et reproductible.
    const f = nextFixture([match('m1', '2026-02-03'), match('m2', '2026-02-03')], [], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('ignores a game with no date', () => {
    const noDate = { ...match('m1', '2026-02-03'), meta: { championshipLabel: 'Poule A', clubId: 'ta', opponentId: 'tb' } }
    expect(nextFixture([noDate], [], new Date('2026-02-01'))).toBeNull()
  })

  it('ignores a game already finished', () => {
    const finished = { ...match('m1', '2026-02-03'), status: 'finished' as const }
    expect(nextFixture([finished], [], new Date('2026-02-01'))).toBeNull()
  })

  it('returns null when nothing is scheduled', () => {
    expect(nextFixture([], [], new Date('2026-02-01'))).toBeNull()
  })
})

describe('since', () => {
  const t0 = new Date('2026-08-13T12:00:00')
  const ago = (ms: number) => since(new Date(t0.getTime() - ms).toISOString(), 'fr', t0)
  const MIN = 60_000, HEURE = 60 * MIN, JOUR = 24 * HEURE

  it('formats nothing under a minute — the interface writes « à l’instant »', () => {
    expect(ago(30_000)).toBeNull()
  })

  it('counts in minutes, then in hours', () => {
    expect(ago(5 * MIN)).toBe('il y a 5 minutes')
    expect(ago(3 * HEURE)).toBe('il y a 3 heures')
  })

  it('tells two days ago from three weeks ago', () => {
    // The whole weight of the message is here: two days still read, three
    // semaines sentent l'oubli.
    expect(ago(2 * JOUR)).toBe('il y a 2 jours')
    expect(ago(21 * JOUR)).toBe('il y a 3 semaines')
  })

  it('moves to months past thirty days', () => {
    expect(ago(40 * JOUR)).toBe('il y a 1 mois')
  })

  it('never returns a negative age for a future date', () => {
    // The device clock moved back since the write: "in 2 hours" would have
    // aucun sens sous un message déjà écrit.
    expect(ago(-2 * HEURE)).toBeNull()
  })
})
