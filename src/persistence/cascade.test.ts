import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { db } from './db'
import { newPlay } from '../domain/plays'

/**
 * Ce que les écritures mettent dans la file.
 *
 * Le piège de `repositories.ts`, ce sont ses cascades. Retirer une équipe emporte
 * ses joueurs, ses résultats, ses séances, ses schémas et son message ; retirer un
 * joueur élague les convocations ; retirer un schéma élague les séances qui le
 * citaient. Chacune de ces écritures dérivées doit partir vers la base.
 *
 * En oublier une ne laisse pas simplement le serveur en retard : à l'hydratation
 * suivante, le manifeste **rend** le document qu'on croyait supprimé, et le ménage
 * se défait sous les yeux de l'utilisateur. C'est un aller-retour, donc ça se voit,
 * donc ça se raconte comme un bug de suppression qui « revient toute seule ».
 *
 * La suite tourne avec `VITE_SYNC_URL` vidé (voir `vite.config.ts`) : ce fichier la
 * repose lui-même, sans quoi la file resterait muette et tous ces tests passeraient
 * pour de mauvaises raisons.
 */
async function depot() {
  vi.stubEnv('VITE_SYNC_URL', '/api')
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0 })))
  return import('./repositories')
}

/** La file, sous une forme lisible : `genre:opération:clef`. */
const file = async () =>
  (await db.outbox.orderBy('seq').toArray()).map((o) => `${o.kind}:${o.op}:${o.id}`)

const vider = () => db.outbox.clear()

beforeEach(async () => {
  await Promise.all([
    db.teams.clear(), db.players.clear(), db.matches.clear(), db.results.clear(),
    db.convocations.clear(), db.trainings.clear(), db.plays.clear(), db.messages.clear(), db.outbox.clear(),
  ])
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('les cinq genres rejoignent la file', () => {
  it('met en file chaque écriture, sous la bonne clef', async () => {
    const r = await depot()
    await r.saveResult({ id: 'r1', championshipLabel: 'Poule A', homeId: 'tb', awayId: 'tc', homeScore: 70, awayScore: 60 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    // Les deux clefs qui ne sont pas un `id` : la convocation est rangée sous sa
    // rencontre, le message sous son club.
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await r.saveMessage({ clubId: 'ta', text: 'Maillot blanc.', writtenAt: '2026-08-10T18:00:00.000Z' })

    expect(await file()).toEqual([
      'result:put:r1', 'training:put:tr1', 'play:put:s1',
      'convocation:put:m1', 'message:put:ta',
    ])
  })

  it('envoie le schéma tel qu’il est rangé, horodatage compris', async () => {
    // `savePlay` ajoute `majLe` à l'objet écrit. Mettre en file l'argument reçu
    // enverrait une version sans horodatage, et la bibliothèque paraîtrait
    // mélangée sur les autres appareils — qui n'ont que l'ordre de la base.
    const r = await depot()
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    const [op] = await db.outbox.toArray()
    expect((op.doc as { updatedAt?: string }).updatedAt).toBeTruthy()
  })
})

describe('les cascades de suppression', () => {
  it('retirer une équipe emporte tout ce qui en dépend', async () => {
    const r = await depot()
    await r.saveTeam({ id: 'ta', name: 'VIGNOT' })
    await r.savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'L' })
    await r.saveResult({ id: 'r1', championshipLabel: 'P', homeId: 'ta', awayId: 'tb', homeScore: 1, awayScore: 2 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveMessage({ clubId: 'ta', text: 'x', writtenAt: '2026-08-10T18:00:00.000Z' })
    await vider()

    await r.deleteTeam('ta')

    expect((await file()).sort()).toEqual([
      'message:del:ta', 'play:del:s1', 'player:del:p1',
      'result:del:r1', 'team:del:ta', 'training:del:tr1',
    ])
  })

  it('retirer un joueur envoie aussi les convocations élaguées', async () => {
    const r = await depot()
    await r.savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'M', firstName: 'L' })
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2'] })
    await vider()

    await r.deletePlayer('p1')

    expect((await file()).sort()).toEqual(['convocation:put:m1', 'player:del:p1'])
    // Et ce qui part est bien la version élaguée, pas l'ancienne.
    const op = (await db.outbox.toArray()).find((o) => o.kind === 'convocation')
    expect((op!.doc as { playerIds: string[] }).playerIds).toEqual(['p2'])
  })

  it('retirer une rencontre emporte sa convocation', async () => {
    const r = await depot()
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await vider()

    await r.deleteMatch('m1')

    expect((await file()).sort()).toEqual(['convocation:del:m1', 'match:del:m1'])
  })

  it('retirer un schéma envoie aussi les séances qui le citaient', async () => {
    const r = await depot()
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05', playIds: ['s1'] })
    await vider()

    await r.deletePlay('s1')

    expect((await file()).sort()).toEqual(['play:del:s1', 'training:put:tr1'])
    const op = (await db.outbox.toArray()).find((o) => o.kind === 'training')
    expect((op!.doc as { playIds: string[] }).playIds).toEqual([])
  })

  it('cocher un schéma sur une séance envoie la séance', async () => {
    const r = await depot()
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await vider()

    await r.toggleTrainingPlay('tr1', 's1')

    expect(await file()).toEqual(['training:put:tr1'])
  })
})

describe('le ménage groupé', () => {
  it('emporte les convocations des rencontres supprimées', async () => {
    const r = await depot()
    await r.saveMatch({ id: 'm1', meta: { clubId: 'ta', opponentId: 'tb' }, roster: [], events: [], status: 'setup' })
    await r.saveConvocation({ matchId: 'm1', playerIds: ['p1'] })
    await vider()

    await r.deleteMatchesWhere(() => true)

    expect((await file()).sort()).toEqual(['convocation:del:m1', 'match:del:m1'])
  })

  it('met en file chaque résultat, séance et schéma supprimé en bloc', async () => {
    const r = await depot()
    await r.saveResult({ id: 'r1', championshipLabel: 'P', homeId: 'tb', awayId: 'tc', homeScore: 1, awayScore: 2 })
    await r.saveTraining({ id: 'tr1', clubId: 'ta', date: '2026-01-05' })
    await r.savePlay({ id: 's1', ...newPlay('ta', 'half', false), name: 'A' })
    await vider()

    await r.deleteAllResults()
    await r.deleteTrainingsOfClub('ta')
    await r.deletePlaysOfClub('ta')

    expect((await file()).sort()).toEqual(['play:del:s1', 'result:del:r1', 'training:del:tr1'])
  })
})
