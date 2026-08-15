import { describe, expect, it } from 'vitest'
import { mergeMatches, furthest } from './fusion'
import { undoLast, removeLastEvent } from './reducer'
import type { GameEvent, Match } from './types'

const basket = (id: string, wallClock: number): GameEvent =>
  ({ id, wallClock, period: 1, gameClock: 600 - wallClock, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' })

const match = (events: GameEvent[], reste: Partial<Match> = {}): Match =>
  ({ id: 'm1', meta: { clubId: 'ta', opponentId: 'tb' }, roster: ['p1'], status: 'live', events, ...reste })

/** L'ordre du journal, en identifiants — la seule chose qu'on veut lire ici. */
const journal = (m: Match) => m.events.map((e) => e.id)

describe('fusionnerMatchs', () => {
  it('ne perd aucun panier quand deux appareils marquent en même temps', () => {
    // La propriété fondatrice : le perdant de l'arbitrage n'a pas tort, il a noté
    // autre chose. L'écraser ferait disparaître des paniers.
    const marqueur = match([basket('a', 10), basket('b', 20)])
    const coach = match([basket('a', 10), basket('c', 15)])

    expect(journal(mergeMatches(marqueur, coach))).toEqual(['a', 'c', 'b'])
  })

  it('donne le même journal quel que soit l’ordre d’arrivée', () => {
    // Sans commutativité, deux miroirs divergeraient en affichant chacun un
    // journal « correct » — et le score afficherait deux vérités.
    const a = match([basket('a', 10), basket('b', 20)])
    const b = match([basket('c', 15), basket('d', 5)])

    expect(journal(mergeMatches(a, b))).toEqual(journal(mergeMatches(b, a)))
  })

  it('départage deux évènements de même heure sur l’identifiant, pas sur l’arrivée', () => {
    const a = match([basket('zzz', 10)])
    const b = match([basket('aaa', 10)])

    expect(journal(mergeMatches(a, b))).toEqual(['aaa', 'zzz'])
    expect(journal(mergeMatches(b, a))).toEqual(['aaa', 'zzz'])
  })

  it('une annulation gagne sur la copie de l’autre appareil', () => {
    // Le coach annule le panier « b ». Le marqueur, qui l'a encore, repousse sa
    // version. Sans les ratures, l'union le ressusciterait.
    const coach = undoLast(match([basket('a', 10), basket('b', 20)]))
    const marqueur = match([basket('a', 10), basket('b', 20)])

    expect(journal(mergeMatches(marqueur, coach))).toEqual(['a'])
    expect(journal(mergeMatches(coach, marqueur))).toEqual(['a'])
  })

  it('un évènement annulé ne revient pas au vidage suivant', () => {
    // Deuxième tour : le marqueur repousse encore son journal périmé, contre un
    // état serveur qui porte déjà la rature.
    const serveur = mergeMatches(match([basket('a', 10), basket('b', 20)]),
                                    undoLast(match([basket('a', 10), basket('b', 20)])))
    const marqueurEnRetard = match([basket('a', 10), basket('b', 20)])

    expect(journal(mergeMatches(serveur, marqueurEnRetard))).toEqual(['a'])
  })

  it('cumule les ratures des deux côtés', () => {
    const coach = undoLast(match([basket('a', 10), basket('b', 20)]))
    const marqueur = removeLastEvent(match([basket('a', 10), basket('c', 30)]), (e) => e.id === 'c')

    const f = mergeMatches(coach, marqueur)
    expect(journal(f)).toEqual(['a'])
    expect(f.retracted?.sort()).toEqual(['b', 'c'])
  })

  it('les champs qui se remplacent viennent du second — celui qui a gagné l’arbitrage', () => {
    const ancien = match([], { meta: { clubId: 'ta', opponentId: 'tb', venue: 'ANCIEN' } })
    const recent = match([], { meta: { clubId: 'ta', opponentId: 'tb', venue: 'RÉCENT' } })

    expect(mergeMatches(ancien, recent).meta.venue).toBe('RÉCENT')
  })

  it('ne pose pas de champ `retires` quand il n’y a rien à rayer', () => {
    // Le document reste tel qu'il était avant ce chantier tant que personne
    // n'annule : rien n'oblige les bases existantes à gagner un champ vide.
    expect(mergeMatches(match([basket('a', 10)]), match([basket('a', 10)])))
      .not.toHaveProperty('retires')
  })
})

describe('le statut ne recule jamais', () => {
  it('une rencontre terminée ne se rouvre pas sous une file en retard', () => {
    // L'appareil hors ligne depuis une heure vide sa file avec un `live` périmé.
    // Une feuille rouverte donne à croire qu'on peut encore la corriger.
    const serveur = match([], { status: 'finished' })
    const enRetard = match([], { status: 'live' })

    expect(mergeMatches(serveur, enRetard).status).toBe('finished')
  })

  it('mais elle avance quand c’est le sens de la marche', () => {
    expect(mergeMatches(match([], { status: 'live' }), match([], { status: 'finished' })).status).toBe('finished')
    expect(furthest('setup', 'live')).toBe('live')
    expect(furthest('finished', 'setup')).toBe('finished')
  })
})

describe('le réducteur note ses ratures', () => {
  it('`undoLast` sort l’évènement du journal et garde son identifiant', () => {
    const m = undoLast(match([basket('a', 10), basket('b', 20)]))
    expect(journal(m)).toEqual(['a'])
    expect(m.retracted).toEqual(['b'])
  })

  it('`removeLastEvent` fait de même sur celui qu’il retire', () => {
    const m = removeLastEvent(match([basket('a', 10), basket('b', 20)]), (e) => e.id === 'a')
    expect(journal(m)).toEqual(['b'])
    expect(m.retracted).toEqual(['a'])
  })

  it('n’invente pas de rature quand il n’y a rien à retirer', () => {
    expect(undoLast(match([])).retracted).toBeUndefined()
    expect(removeLastEvent(match([basket('a', 10)]), () => false).retracted).toBeUndefined()
  })
})
