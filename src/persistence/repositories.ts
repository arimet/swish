import { db } from './db'
import { enqueuePut, enqueueDel, remoteEnabled, hydrate } from './remote'
import { aVider } from '../domain/menage'
import type { Team, Player, Match, ReportedResult, Convocation, Training } from '../domain/types'
import type { Schema } from '../domain/plays'

// Écritures : cache local (immédiat, offline-ok) + mise en file pour le serveur.
export const saveTeam = async (t: Team) => { await db.teams.put(t); await enqueuePut('team', t.id, t) }
export const getTeam = (id: string) => db.teams.get(id)
export const getPlayer = (id: string) => db.players.get(id)
export const listTeams = () => db.teams.toArray()
/** Supprime une équipe, ses joueurs, et les résultats saisis à la main qui la
 *  mentionnent (d'un côté comme de l'autre) : un résultat dont une équipe n'existe
 *  plus n'a plus de sens, on le supprime plutôt que de le laisser hanter le
 *  classement sous son identifiant brut. La table des résultats reste petite ; un
 *  filtrage sur `toArray()` évite d'ajouter un index Dexie pour si peu. */
export const deleteTeam = async (id: string) => {
  const players = await db.players.where('teamId').equals(id).toArray()
  const résultats = (await db.results.toArray()).filter((r) => r.homeId === id || r.awayId === id)
  // Les entraînements sont propres au club (jamais partagés) : sans cette purge, ils
  // resteraient en base sous un `clubId` qui ne reviendra jamais, donc invisibles sur
  // tous les écrans et impossibles à supprimer — même sort que les résultats ci-dessus.
  const entraînements = (await db.trainings.toArray()).filter((t) => t.clubId === id)
  await db.transaction('rw', db.teams, db.players, db.results, db.trainings, db.plays, async () => {
    await db.players.where('teamId').equals(id).delete()
    await db.teams.delete(id)
    await db.results.bulkDelete(résultats.map((r) => r.id))
    await db.trainings.bulkDelete(entraînements.map((t) => t.id))
    // Les schémas sont propres au club, comme les entraînements : même purge, mais
    // via l'index `clubId` de la table, qui évite de relire tout le tableau tactique.
    await db.plays.where('clubId').equals(id).delete()
  })
  for (const p of players) await enqueueDel('player', p.id)
  await enqueueDel('team', id)
}

export const savePlayer = async (p: Player) => { await db.players.put(p); await enqueuePut('player', p.id, p) }
export const listPlayers = (teamId: string) => db.players.where('teamId').equals(teamId).toArray()
/** Supprime un joueur et le retire de toutes les convocations qui le mentionnent :
 *  sans cette cascade, une convocation garderait un joueur qui n'existe plus,
 *  indécochable, et fausserait le compte affiché sur la fiche de rencontre. Table
 *  des convocations petite, un filtrage sur `toArray()` suffit (cf. `deleteTeam`). */
export const deletePlayer = async (id: string) => {
  const convocations = (await db.convocations.toArray()).filter((c) => c.playerIds.includes(id))
  await db.transaction('rw', db.players, db.convocations, async () => {
    await db.players.delete(id)
    await db.convocations.bulkPut(convocations.map((c) => ({ ...c, playerIds: c.playerIds.filter((pid) => pid !== id) })))
  })
  await enqueueDel('player', id)
}

export const saveMatch = async (m: Match) => { await db.matches.put(m); await enqueuePut('match', m.id, m) }
/** Match local ; à défaut, tente une hydratation depuis le serveur (autre machine). */
export const getMatch = async (id: string): Promise<Match | undefined> => {
  let m = await db.matches.get(id)
  if (!m && remoteEnabled()) { await hydrate(); m = await db.matches.get(id) }
  return m
}
export const listMatches = () => db.matches.toArray()
/** Supprime la rencontre et sa convocation : une convocation sans rencontre n'a
 *  aucun sens, et resterait sinon invisible et indéboulonnable. */
export const deleteMatch = async (id: string) => {
  await db.transaction('rw', db.matches, db.convocations, async () => {
    await db.matches.delete(id)
    await db.convocations.delete(id)
  })
  await enqueueDel('match', id)
}

/** Les résultats saisis restent locaux à l'appareil : ils ne passent pas par la file
 *  de synchronisation, qui ne transporte qu'équipes, joueurs et rencontres. */
export const listResults = () => db.results.toArray()
export const saveResult = async (r: ReportedResult) => { await db.results.put(r) }
export const deleteResult = async (id: string) => { await db.results.delete(id) }

/** Convocations et entraînements restent locaux à l'appareil : comme les résultats
 *  du championnat, ils ne passent pas par la file de synchronisation. */
export const getConvocation = (matchId: string) => db.convocations.get(matchId)
export const saveConvocation = async (c: Convocation) => { await db.convocations.put(c) }
export const listTrainings = () => db.trainings.toArray()
export const saveTraining = async (t: Training) => { await db.trainings.put(t) }
export const deleteTraining = async (id: string) => { await db.trainings.delete(id) }

/** Attache un schéma à un entraînement, ou l'en retire. Le va-et-vient se fait dans
 *  une transaction, à partir de la séance relue : deux cases cochées coup sur coup
 *  partiraient sinon toutes deux de la même séance périmée, et la seconde écriture
 *  effacerait la première. Les identifiants qui ne désignent plus aucun schéma
 *  tombent au passage — même garde que la lecture, appliquée ici à l'écriture. */
export const toggleTrainingPlay = async (trainingId: string, playId: string) => {
  await db.transaction('rw', db.trainings, db.plays, async () => {
    const t = await db.trainings.get(trainingId)
    if (!t) return
    const ids = t.playIds ?? []
    const suivants = ids.includes(playId) ? ids.filter((id) => id !== playId) : [...ids, playId]
    const existants = await db.plays.bulkGet(suivants)
    await db.trainings.put({ ...t, playIds: suivants.filter((_, i) => !!existants[i]) })
  })
}

/** Les schémas du tableau tactique restent locaux à l'appareil, comme les résultats,
 *  les convocations et les entraînements : la file de synchronisation ne transporte
 *  qu'équipes, joueurs et rencontres. Supprimer une équipe emporte ses schémas
 *  (cf. `deleteTeam`). */
export const listPlays = (clubId: string) => db.plays.where('clubId').equals(clubId).toArray()
export const getPlay = (id: string) => db.plays.get(id)
/** Horodate à l'enregistrement : sans `majLe`, la bibliothèque n'aurait que l'ordre
 *  de la base, c'est-à-dire aucun, et paraîtrait mélangée à chaque ouverture. */
export const savePlay = async (s: Schema) => { await db.plays.put({ ...s, majLe: new Date().toISOString() }) }
/** Supprime un schéma et le retire des entraînements qui le citaient, dans la même
 *  transaction : même cascade que `deletePlayer` sur les convocations, et pour la
 *  même raison — un identifiant orphelin fausserait le compte affiché sur la séance.
 *
 *  Les séances se relisent **dans** la transaction. Les lire avant, c'est prendre un
 *  instantané : deux suppressions coup sur coup partiraient toutes deux du même état,
 *  et la seconde écriture réinstallerait l'identifiant que la première venait de
 *  retirer. Le déchet resterait ensuite indéfiniment. */
export const deletePlay = async (id: string) =>
  db.transaction('rw', db.plays, db.trainings, async () => {
    await db.plays.delete(id)
    const séances = (await db.trainings.toArray()).filter((t) => t.playIds?.includes(id))
    await db.trainings.bulkPut(séances.map((t) => ({ ...t, playIds: t.playIds!.filter((pid) => pid !== id) })))
  })

// ── Ménage d'administration ─────────────────────────────────────────────────
// Suppressions groupées, irréversibles : ni corbeille ici, ni copie ailleurs pour
// tout ce qui ne passe pas par la file de synchronisation. Chacune se cadre sur un
// périmètre relu **dans** sa transaction, comme `deletePlay` : lire avant, c'est
// prendre un instantané, et deux ménages coup sur coup partiraient du même état.

/** Supprime les rencontres qui répondent au filtre et leurs convocations — même
 *  cascade que `deleteMatch`, appliquée en bloc. Renvoie les identifiants supprimés,
 *  de quoi rendre compte de ce qui a réellement disparu. */
export const deleteMatchesWhere = async (filtre: (m: Match) => boolean): Promise<string[]> => {
  const ids: string[] = []
  await db.transaction('rw', db.matches, db.convocations, async () => {
    ids.push(...(await db.matches.toArray()).filter(filtre).map((m) => m.id))
    await db.matches.bulkDelete(ids)
    await db.convocations.bulkDelete(ids)
  })
  for (const id of ids) await enqueueDel('match', id)
  return ids
}

/** Vide les feuilles d'un club : les évènements enregistrés partent, la rencontre,
 *  sa date et sa convocation restent. Le statut redescend à « à venir » — une
 *  rencontre « terminée » sans le moindre évènement s'afficherait 0–0 partout, comme
 *  un score réellement observé. Renvoie le nombre de feuilles vidées. */
export const clearClubStats = async (clubId: string): Promise<number> => {
  let vidées: Match[] = []
  await db.transaction('rw', db.matches, async () => {
    vidées = (await db.matches.toArray()).filter(aVider(clubId)).map((m) => ({ ...m, events: [], status: 'setup' as const }))
    await db.matches.bulkPut(vidées)
  })
  for (const m of vidées) await enqueuePut('match', m.id, m)
  return vidées.length
}

/** Les résultats saisis à la main, en bloc. Aucune cascade : rien ne les référence. */
export const deleteAllResults = () => db.results.clear()

/** Les entraînements d'un club, en bloc. Leurs `playIds` partent avec eux : ce sont
 *  les séances qui citent les schémas, jamais l'inverse. */
export const deleteTrainingsOfClub = (clubId: string) => db.trainings.filter((t) => t.clubId === clubId).delete()

/** Les schémas d'un club, en bloc, et leurs identifiants retirés des séances qui les
 *  citaient — même cascade que `deletePlay`, sinon le ménage laisserait derrière lui
 *  des identifiants orphelins dans les entraînements conservés. */
export const deletePlaysOfClub = async (clubId: string) =>
  db.transaction('rw', db.plays, db.trainings, async () => {
    const ids = await db.plays.where('clubId').equals(clubId).primaryKeys()
    await db.plays.bulkDelete(ids)
    const séances = (await db.trainings.toArray()).filter((t) => t.playIds?.some((pid) => ids.includes(pid)))
    await db.trainings.bulkPut(séances.map((t) => ({ ...t, playIds: t.playIds!.filter((pid) => !ids.includes(pid)) })))
  })

/** Remise à zéro complète de l'appareil : toutes les tables, file de synchronisation
 *  comprise. La file part sans être poussée, volontairement — un effacement local ne
 *  doit pas se propager au serveur et vider du même coup les autres appareils. */
export const wipeAll = () =>
  // Les tables passent par un tableau : au-delà de cinq, Dexie ne les prend plus une à une.
  db.transaction('rw', [db.teams, db.players, db.matches, db.results, db.convocations, db.trainings, db.plays, db.outbox], async () => {
    await Promise.all([
      db.teams.clear(), db.players.clear(), db.matches.clear(), db.results.clear(),
      db.convocations.clear(), db.trainings.clear(), db.plays.clear(), db.outbox.clear(),
    ])
  })
