import { describe, expect, it } from 'vitest'
import { nextFixture } from './fixtures'
import type { Match, Training } from './types'

const match = (id: string, date: string): Match => ({
  id, meta: { championshipLabel: 'Poule A', date, clubId: 'ta', opponentId: 'tb' },
  roster: [], events: [], status: 'setup',
})
const entrainement = (id: string, date: string): Training => ({ id, date })

describe('nextFixture', () => {
  it('choisit la première échéance à venir', () => {
    const f = nextFixture([match('m1', '2026-02-07')], [entrainement('e1', '2026-02-03')], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'training', id: 'e1' })
  })

  it('ne choisit jamais une échéance passée', () => {
    const f = nextFixture([match('m1', '2026-01-10')], [entrainement('e1', '2026-01-05')], new Date('2026-02-01'))
    expect(f).toBeNull()
  })

  it('retient le jour même', () => {
    // Le matin d'un match, l'échéance du jour est celle qui compte.
    const f = nextFixture([match('m1', '2026-02-01')], [], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('à égalité de date, la rencontre passe avant l’entraînement', () => {
    const f = nextFixture([match('m1', '2026-02-03')], [entrainement('e1', '2026-02-03')], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('ignore une rencontre sans date', () => {
    const sansDate = { ...match('m1', '2026-02-03'), meta: { championshipLabel: 'Poule A', clubId: 'ta', opponentId: 'tb' } }
    expect(nextFixture([sansDate], [], new Date('2026-02-01'))).toBeNull()
  })

  it('ignore une rencontre déjà terminée', () => {
    const finie = { ...match('m1', '2026-02-03'), status: 'finished' as const }
    expect(nextFixture([finie], [], new Date('2026-02-01'))).toBeNull()
  })

  it('renvoie null quand rien n’est prévu', () => {
    expect(nextFixture([], [], new Date('2026-02-01'))).toBeNull()
  })
})
