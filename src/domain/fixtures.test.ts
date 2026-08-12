import { describe, expect, it } from 'vitest'
import { nextFixture } from './fixtures'
import type { Match, Training } from './types'

const match = (id: string, date: string): Match => ({
  id, meta: { championshipLabel: 'Poule A', date, clubId: 'ta', opponentId: 'tb' },
  roster: [], events: [], status: 'setup',
})
const entrainement = (id: string, date: string): Training => ({ id, date, clubId: 'ta' })

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

  it('utilise le jour local, pas le jour UTC', () => {
    // 0h30 heure locale le 3 février : en UTC, selon le décalage, on peut encore
    // être le 2. Le jour retenu doit rester le 3 (composantes locales), sinon
    // l'échéance du 2 — déjà passée pour l'utilisateur — repasserait le filtre.
    const aube = new Date(2026, 1, 3, 0, 30)
    expect(nextFixture([match('m1', '2026-02-02')], [], aube)).toBeNull()
    expect(nextFixture([match('m1', '2026-02-03')], [], aube)).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('à égalité de date, la rencontre passe avant l’entraînement', () => {
    const f = nextFixture([match('m1', '2026-02-03')], [entrainement('e1', '2026-02-03')], new Date('2026-02-01'))
    expect(f).toMatchObject({ kind: 'match', id: 'm1' })
  })

  it('entre deux rencontres à la même date, retient la première par ordre d’insertion', () => {
    // Un comparateur qui ne regarderait que a.kind (jamais b.kind) serait incohérent
    // entre deux échéances de même nature : cmp(a,b) et cmp(b,a) renverraient tous
    // deux -1. Le tri étant stable, l'ordre d'insertion doit trancher, de façon
    // déterministe et reproductible.
    const f = nextFixture([match('m1', '2026-02-03'), match('m2', '2026-02-03')], [], new Date('2026-02-01'))
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
