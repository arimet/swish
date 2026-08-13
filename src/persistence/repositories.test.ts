import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveTeam, listTeams, saveMatch, getMatch, listMatches, deleteMatch, deleteTeam, saveResult, listResults, savePlayer, deletePlayer, saveTraining, listTrainings, saveConvocation, getConvocation, savePlay, listPlays, getPlay, deletePlay, deleteMatchesWhere, clearClubStats, deleteAllResults, deleteTrainingsOfClub, deletePlaysOfClub, wipeAll } from './repositories'
import { nouveauSchema } from '../domain/plays'
import { aVider, deLAnnee, duChampionnat } from '../domain/menage'
import type { GameEvent, Match } from '../domain/types'

beforeEach(async () => {
  await db.teams.clear(); await db.players.clear(); await db.matches.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear(); await db.outbox.clear()
})

const match = (id: string): Match => ({
  id, meta: { championshipLabel: 'PRM', clubId: 'a', opponentId: 'b' },
  roster: [], events: [], status: 'setup',
})

describe('repositories', () => {
  it('sauvegarde et liste les équipes', async () => {
    await saveTeam({ id: 't1', name: 'VIGNOT' })
    expect((await listTeams()).map((t) => t.name)).toContain('VIGNOT')
  })
  it('sauvegarde, relit et supprime un match', async () => {
    await saveMatch(match('m1'))
    expect((await getMatch('m1'))?.id).toBe('m1')
    expect(await listMatches()).toHaveLength(1)
    await deleteMatch('m1')
    expect(await getMatch('m1')).toBeUndefined()
  })
  it('persiste le journal d\'evenements', async () => {
    const m = match('m2')
    m.events.push({ id: 'e1', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })
    await saveMatch(m)
    expect((await getMatch('m2'))?.events).toHaveLength(1)
  })
  it('supprime les résultats saisis qui mentionnent une équipe supprimée, des deux côtés', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveTeam({ id: 'tb', name: 'VERDUN' })
    await saveTeam({ id: 'tc', name: 'METZ' })
    // « ta » supprimée : le premier résultat (ta reçoit tb) et le second (tc reçoit ta)
    // la mentionnent chacun d'un côté différent — les deux doivent disparaître.
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'ta', awayId: 'tb', homeScore: 70, awayScore: 60 })
    await saveResult({ id: 'r2', championshipLabel: 'Poule A', date: '2026-01-17', homeId: 'tc', awayId: 'ta', homeScore: 55, awayScore: 80 })
    await saveResult({ id: 'r3', championshipLabel: 'Poule A', date: '2026-01-17', homeId: 'tb', awayId: 'tc', homeScore: 60, awayScore: 50 })

    await deleteTeam('ta')

    expect((await listResults()).map((r) => r.id)).toEqual(['r3'])
  })

  it('supprime les entraînements du club supprimé, comme les résultats', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-10' })
    await saveTraining({ id: 'tr2', clubId: 'ta', date: '2026-01-15' })
    await saveTraining({ id: 'tr3', clubId: 'tb', date: '2026-01-10' })

    await deleteTeam('ta')

    expect((await listTrainings()).map((t) => t.id)).toEqual(['tr3'])
  })

  it('retire un joueur supprimé de toutes les convocations qui le mentionnent', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
    await savePlayer({ id: 'p2', teamId: 'ta', number: 7, lastName: 'BERNARD', firstName: 'Hugo' })
    await saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2'] })
    await saveConvocation({ matchId: 'm2', playerIds: ['p2'] })

    await deletePlayer('p2')

    expect((await getConvocation('m1'))?.playerIds).toEqual(['p1'])
    expect((await getConvocation('m2'))?.playerIds).toEqual([])
  })

  it('enregistre, liste par club et supprime un schéma', async () => {
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'PnR haut' })
    await savePlay({ id: 's2', ...nouveauSchema('tb', 'demi', false), nom: 'Autre club' })
    expect((await listPlays('ta')).map((s) => s.id)).toEqual(['s1'])
    expect((await getPlay('s1'))?.nom).toBe('PnR haut')
    await deletePlay('s1')
    expect(await listPlays('ta')).toEqual([])
    expect(await getPlay('s1')).toBeUndefined()
  })

  it('supprimer une équipe emporte ses schémas', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'PnR haut' })
    await savePlay({ id: 's2', ...nouveauSchema('tb', 'demi', false), nom: 'Autre club' })
    await deleteTeam('ta')
    expect(await listPlays('ta')).toEqual([])
    expect((await listPlays('tb')).map((s) => s.id)).toEqual(['s2'])
  })

  it('horodate chaque enregistrement de schéma', async () => {
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    const relu = (await getPlay('s1'))!
    expect(relu.majLe).toBeTruthy()
    expect(Number.isNaN(Date.parse(relu.majLe!))).toBe(false)
  })

  it('supprimer un schéma le retire des entraînements qui le citaient', async () => {
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    await savePlay({ id: 's2', ...nouveauSchema('ta', 'demi', false), nom: 'B' })
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })
    await deletePlay('s1')
    expect((await listTrainings())[0].playIds).toEqual(['s2'])
  })

  it('supprime deux schémas coup sur coup sans qu’un identifiant ressuscite', async () => {
    // Lire les séances avant la transaction, c'est en prendre un instantané : les
    // deux suppressions partiraient du même état et la seconde réinstallerait
    // l'identifiant que la première venait de retirer, pour de bon.
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    await savePlay({ id: 's2', ...nouveauSchema('ta', 'demi', false), nom: 'B' })
    await saveTraining({ id: 't1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })

    await Promise.all([deletePlay('s1'), deletePlay('s2')])

    expect((await listTrainings())[0].playIds).toEqual([])
    expect(await listPlays('ta')).toEqual([])
  })

  it('les schémas ne passent pas par la file de synchronisation', async () => {
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'PnR haut' })
    await deletePlay('s1')
    expect(await db.outbox.count()).toBe(0)
  })
})

// ── Ménage d'administration : suppressions groupées, irréversibles ───────────
// Chacune ne doit emporter QUE son périmètre : une opération de ménage qui
// déborde ne se rattrape pas, il n'y a pas de corbeille et rien n'est synchronisé.

const evt = (id: string): GameEvent => ({ id, type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 })

const rencontre = (id: string, champ: string, date: string | undefined, clubId = 'ta', events: GameEvent[] = []): Match => ({
  id, meta: { championshipLabel: champ, date, clubId, opponentId: 'tb' }, roster: [], events, status: events.length ? 'finished' : 'setup',
})

describe('ménage groupé', () => {
  it('supprime les rencontres d’un championnat et leurs convocations, en laissant les autres intactes', async () => {
    await saveMatch(rencontre('m1', 'Poule A', '2026-01-10'))
    await saveMatch(rencontre('m2', 'Poule A', '2026-01-17'))
    await saveMatch(rencontre('m3', 'Poule B', '2026-01-17'))
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await saveConvocation({ matchId: 'm3', playerIds: ['p1'] })

    const supprimées = await deleteMatchesWhere(duChampionnat('Poule A'))

    expect(supprimées.sort()).toEqual(['m1', 'm2'])
    expect((await listMatches()).map((m) => m.id)).toEqual(['m3'])
    expect(await getConvocation('m1')).toBeUndefined()
    expect(await getConvocation('m3')).toBeDefined()
  })

  it('supprime les rencontres d’une année civile, sans toucher aux autres années ni aux rencontres sans date', async () => {
    await saveMatch(rencontre('m1', 'Poule A', '2025-11-08'))
    await saveMatch(rencontre('m2', 'Poule A', '2026-01-17'))
    await saveMatch(rencontre('m3', 'Poule A', undefined))

    await deleteMatchesWhere(deLAnnee('2026'))

    expect((await listMatches()).map((m) => m.id).sort()).toEqual(['m1', 'm3'])
  })

  it('vide les feuilles d’un club sans supprimer ses rencontres ni leurs dates', async () => {
    await saveMatch(rencontre('m1', 'Poule A', '2026-01-10', 'ta', [evt('e1'), evt('e2')]))
    await saveMatch(rencontre('m2', 'Poule A', '2026-01-17', 'tz', [evt('e3')]))
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })

    const vidées = await clearClubStats('ta')

    expect(vidées).toBe(1)
    const m1 = await getMatch('m1')
    expect(m1?.events).toEqual([])
    expect(m1?.meta.date).toBe('2026-01-10')
    // La feuille est vierge : la rencontre n'est plus « terminée », sans quoi elle
    // s'afficherait 0–0 comme un score réellement observé.
    expect(m1?.status).toBe('setup')
    // Le club voisin et la convocation ne bougent pas : vider n'est pas supprimer.
    expect((await getMatch('m2'))?.events).toHaveLength(1)
    expect(await getConvocation('m1')).toBeDefined()
  })

  it('supprime en bloc les résultats saisis, les entraînements du club et ses schémas', async () => {
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await saveTraining({ id: 'tr2', clubId: 'tz', date: '2026-01-05' })
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    await savePlay({ id: 's2', ...nouveauSchema('tz', 'demi', false), nom: 'B' })

    await deleteAllResults()
    await deleteTrainingsOfClub('ta')
    await deletePlaysOfClub('ta')

    expect(await listResults()).toEqual([])
    expect((await listTrainings()).map((t) => t.id)).toEqual(['tr2'])
    expect(await listPlays('ta')).toEqual([])
    expect((await listPlays('tz')).map((s) => s.id)).toEqual(['s2'])
  })

  it('retire des séances conservées les schémas supprimés en bloc, sans laisser d’identifiant orphelin', async () => {
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    await savePlay({ id: 's2', ...nouveauSchema('ta', 'demi', false), nom: 'B' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })

    await deletePlaysOfClub('ta')

    expect((await listTrainings())[0].playIds).toEqual([])
  })

  it('supprime les schémas de deux clubs coup sur coup sans qu’un identifiant ressuscite', async () => {
    // Même piège que `deletePlay` : lire les séances avant la transaction, c'est en
    // prendre un instantané — les deux ménages partiraient du même état et le second
    // réinstallerait l'identifiant que le premier venait de retirer, pour de bon.
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    await savePlay({ id: 's2', ...nouveauSchema('tz', 'demi', false), nom: 'B' })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-09-01', playIds: ['s1', 's2'] })

    await Promise.all([deletePlaysOfClub('ta'), deletePlaysOfClub('tz')])

    expect((await listTrainings())[0].playIds).toEqual([])
  })

  it('vide toutes les tables, file de synchronisation comprise', async () => {
    await saveTeam({ id: 'ta', name: 'VIGNOT' })
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
    await saveMatch(rencontre('m1', 'Poule A', '2026-01-10', 'ta', [evt('e1')]))
    await saveResult({ id: 'r1', championshipLabel: 'Poule A', date: '2026-01-10', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await savePlay({ id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'A' })
    // Une mutation en attente d'envoi : elle ne doit pas survivre à la remise à zéro.
    await db.outbox.add({ kind: 'match', op: 'put', id: 'm1', ts: Date.now() })

    await wipeAll()

    const comptes = await Promise.all([
      db.teams.count(), db.players.count(), db.matches.count(), db.results.count(),
      db.convocations.count(), db.trainings.count(), db.plays.count(), db.outbox.count(),
    ])
    expect(comptes).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('ne compte comme feuille à vider qu’une rencontre qui porte des évènements', async () => {
    // Le compte annoncé à l'écran est celui de ce qui sera réellement détruit :
    // une rencontre encore vierge n'a rien à perdre et ne doit pas le gonfler.
    await saveMatch(rencontre('vierge', 'Poule A', '2026-01-10', 'ta'))
    await saveMatch(rencontre('remplie', 'Poule A', '2026-01-17', 'ta', [evt('e1')]))

    expect((await listMatches()).filter(aVider('ta'))).toHaveLength(1)
    expect(await clearClubStats('ta')).toBe(1)
  })
})
