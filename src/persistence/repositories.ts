import { db } from './db'
import { enqueuePut, enqueueDel, remoteEnabled, hydrate } from './remote'
import { hasEvents } from '../domain/cleanup'
import type { Team, Player, Match, ReportedResult, Convocation, Training, TeamMessage } from '../domain/types'
import type { Play } from '../domain/plays'

/*
 * Writes: local mirror first (immediate, fine offline), then queued for the
 * database — which is the source of truth.
 *
 * THE RULE, AND IT HAS NO EXCEPTION: every write to a `db` table queues the
 * matching operation, **cascades included**. Forgetting one does not merely leave
 * the server behind: at the next hydration the manifest brings back the document
 * you thought deleted, and the cleanup is undone before the user's eyes.
 *
 * That is this file's trap, because deletions here cascade: removing a team takes
 * its players, its results, its sessions, its plays and its message; removing a
 * player touches the call-ups; removing a play touches the sessions that cited it.
 * `repositories.test.ts` checks the queue after each of these operations,
 * precisely so that an omission shows.
 */
export const saveTeam = async (t: Team) => { await db.teams.put(t); await enqueuePut('team', t.id, t) }
export const getTeam = (id: string) => db.teams.get(id)
export const getPlayer = (id: string) => db.players.get(id)
export const listTeams = () => db.teams.toArray()
/** Deletes a team, its players, and the hand-entered results that mention it (on
 *  either side): a result whose team no longer exists has no meaning left, so we
 *  delete it rather than let it haunt the standings under its raw id. The results
 *  table stays small; filtering `toArray()` avoids adding a Dexie index for so
 *  little. */
export const deleteTeam = async (id: string) => {
  const players = await db.players.where('teamId').equals(id).toArray()
  const results = (await db.results.toArray()).filter((r) => r.homeId === id || r.awayId === id)
  // Trainings belong to the club (never shared): without this purge they would stay
  // in the database under a `clubId` that will never come back, hence invisible on
  // every screen and impossible to delete — same fate as the results above.
  const trainings = (await db.trainings.toArray()).filter((t) => t.clubId === id)
  const plays = await db.plays.where('clubId').equals(id).toArray()
  await db.transaction('rw', [db.teams, db.players, db.results, db.trainings, db.plays, db.messages], async () => {
    await db.players.where('teamId').equals(id).delete()
    await db.teams.delete(id)
    // The message is the club's: without this purge it would outlive the team,
    // invisible (no screen carries that `clubId` any more) and impossible to erase.
    await db.messages.delete(id)
    await db.results.bulkDelete(results.map((r) => r.id))
    await db.trainings.bulkDelete(trainings.map((t) => t.id))
    // Plays belong to the club, like trainings: same purge, but through the table's
    // `clubId` index, which spares re-reading the whole playbook.
    await db.plays.where('clubId').equals(id).delete()
  })
  for (const p of players) await enqueueDel('player', p.id)
  for (const r of results) await enqueueDel('result', r.id)
  for (const t of trainings) await enqueueDel('training', t.id)
  for (const s of plays) await enqueueDel('play', s.id)
  await enqueueDel('message', id)
  await enqueueDel('team', id)
}

export const savePlayer = async (p: Player) => { await db.players.put(p); await enqueuePut('player', p.id, p) }
export const listPlayers = (teamId: string) => db.players.where('teamId').equals(teamId).toArray()
/** Deletes a player and removes them from every call-up that mentions them: without
 *  this cascade a call-up would keep a player who no longer exists, impossible to
 *  untick, and would skew the count shown on the game sheet. The call-ups table is
 *  small, filtering `toArray()` is enough (cf. `deleteTeam`). */
export const deletePlayer = async (id: string) => {
  const convocations = (await db.convocations.toArray()).filter((c) => c.playerIds.includes(id))
  const pruned = convocations.map((c) => ({ ...c, playerIds: c.playerIds.filter((pid) => pid !== id) }))
  await db.transaction('rw', db.players, db.convocations, async () => {
    await db.players.delete(id)
    await db.convocations.bulkPut(pruned)
  })
  await enqueueDel('player', id)
  // The pruned call-ups are writes like any other: without them the removed player
  // would come back into the called-up list at the next hydration.
  for (const c of pruned) await enqueuePut('convocation', c.matchId, c)
}

export const saveMatch = async (m: Match) => { await db.matches.put(m); await enqueuePut('match', m.id, m) }
/** The local game; failing that, tries a hydration from the server (another device). */
export const getMatch = async (id: string): Promise<Match | undefined> => {
  let m = await db.matches.get(id)
  if (!m && remoteEnabled()) { await hydrate(); m = await db.matches.get(id) }
  return m
}
export const listMatches = () => db.matches.toArray()
/** Deletes the game and its call-up: a call-up without a game makes no sense, and
 *  would otherwise stay invisible and immovable. */
export const deleteMatch = async (id: string) => {
  await db.transaction('rw', db.matches, db.convocations, async () => {
    await db.matches.delete(id)
    await db.convocations.delete(id)
  })
  await enqueueDel('match', id)
  await enqueueDel('convocation', id)
}

export const listResults = () => db.results.toArray()
export const saveResult = async (r: ReportedResult) => { await db.results.put(r); await enqueuePut('result', r.id, r) }
export const deleteResult = async (id: string) => { await db.results.delete(id); await enqueueDel('result', id) }

/** The call-up is filed under **the game** rather than under an id of its own:
 *  there is one per game, and the `put` on that key makes replacement free. The
 *  shared kind therefore carries `matchId` as its key. */
export const getConvocation = (matchId: string) => db.convocations.get(matchId)
export const saveConvocation = async (c: Convocation) => { await db.convocations.put(c); await enqueuePut('convocation', c.matchId, c) }
export const listTrainings = () => db.trainings.toArray()
export const saveTraining = async (t: Training) => { await db.trainings.put(t); await enqueuePut('training', t.id, t) }
export const deleteTraining = async (id: string) => { await db.trainings.delete(id); await enqueueDel('training', id) }

/** The coach's message to the team: one per club, filed **under the club**, which
 *  therefore serves as its shared key. Writing a new one replaces the previous:
 *  the `put` on that key guarantees it, no cleanup is needed. Deleting the team
 *  takes its message along (cf. `deleteTeam`).
 *
 *  This is the document that justifies the sync step on its own: a player could
 *  not read it, since it never left the coach's phone. */
export const getMessage = (clubId: string) => db.messages.get(clubId)
export const saveMessage = async (m: TeamMessage) => { await db.messages.put(m); await enqueuePut('message', m.clubId, m) }
export const deleteMessage = async (clubId: string) => { await db.messages.delete(clubId); await enqueueDel('message', clubId) }

/** Attaches a play to a training session, or detaches it. The toggle happens inside
 *  a transaction, from the session re-read there: two boxes ticked in quick
 *  succession would otherwise both start from the same stale session, and the second
 *  write would erase the first. Ids that no longer name any play are dropped along
 *  the way — the same guard as the read, applied here to the write. */
export const toggleTrainingPlay = async (trainingId: string, playId: string) => {
  let written: Training | null = null
  await db.transaction('rw', db.trainings, db.plays, async () => {
    const t = await db.trainings.get(trainingId)
    if (!t) return
    const ids = t.playIds ?? []
    const next = ids.includes(playId) ? ids.filter((id) => id !== playId) : [...ids, playId]
    const existing = await db.plays.bulkGet(next)
    written = { ...t, playIds: next.filter((_, i) => !!existing[i]) }
    await db.trainings.put(written)
  })
  if (written) await enqueuePut('training', (written as Training).id, written)
}

/** The playbook belongs to the club, and travels like everything else: `savePlay`
 *  queues it, so a play drawn on the coach's phone reaches the players'. Deleting a
 *  team takes its plays along (cf. `deleteTeam`). */
export const listPlays = (clubId: string) => db.plays.where('clubId').equals(clubId).toArray()
export const getPlay = (id: string) => db.plays.get(id)
/** Stamps the time on save: without `updatedAt` the library would only have the
 *  database's order, which is to say none, and would look shuffled at every
 *  opening. */
export const savePlay = async (s: Play) => {
  // The timestamp is part of the stored document: queueing `s` rather than the
  // written object would send the server a version without `updatedAt`, and the
  // library would end up shuffled on the other devices.
  const written = { ...s, updatedAt: new Date().toISOString() }
  await db.plays.put(written)
  await enqueuePut('play', written.id, written)
}
/** Deletes a play and removes it from the trainings that cited it, in the same
 *  transaction: the same cascade as `deletePlayer` on call-ups, and for the same
 *  reason — an orphan id would skew the count shown on the session.
 *
 *  The sessions are re-read **inside** the transaction. Reading them before is
 *  taking a snapshot: two deletions in quick succession would both start from the
 *  same state, and the second write would reinstate the id the first had just
 *  removed. The debris would then stay forever. */
export const deletePlay = async (id: string) => {
  let pruned: Training[] = []
  await db.transaction('rw', db.plays, db.trainings, async () => {
    await db.plays.delete(id)
    const sessions = (await db.trainings.toArray()).filter((t) => t.playIds?.includes(id))
    pruned = sessions.map((t) => ({ ...t, playIds: t.playIds!.filter((pid) => pid !== id) }))
    await db.trainings.bulkPut(pruned)
  })
  await enqueueDel('play', id)
  for (const t of pruned) await enqueuePut('training', t.id, t)
}

// ── Administrative cleanup ──────────────────────────────────────────────────
// Bulk, irreversible deletions: no bin here, and no copy elsewhere for anything
// that does not go through the sync queue. Each one frames itself on a scope
// re-read **inside** its transaction, like `deletePlay`: reading before is taking a
// snapshot, and two cleanups in quick succession would start from the same state.

/** Deletes the games matching the filter and their call-ups — the same cascade as
 *  `deleteMatch`, applied in bulk. Returns the deleted ids, enough to report what
 *  actually disappeared. */
export const deleteMatchesWhere = async (filter: (m: Match) => boolean): Promise<string[]> => {
  const ids: string[] = []
  await db.transaction('rw', db.matches, db.convocations, async () => {
    ids.push(...(await db.matches.toArray()).filter(filter).map((m) => m.id))
    await db.matches.bulkDelete(ids)
    await db.convocations.bulkDelete(ids)
  })
  for (const id of ids) { await enqueueDel('match', id); await enqueueDel('convocation', id) }
  return ids
}

/** Empties a club's game sheets: the recorded events go, the game, its date and its
 *  call-up stay. The status drops back to "upcoming" — a "finished" game without a
 *  single event would show 0–0 everywhere, like a score actually observed. Returns
 *  the number of sheets emptied. */
export const clearClubStats = async (clubId: string): Promise<number> => {
  let cleared: Match[] = []
  await db.transaction('rw', db.matches, async () => {
    cleared = (await db.matches.toArray()).filter(hasEvents(clubId)).map((m) => ({ ...m, events: [], status: 'setup' as const }))
    await db.matches.bulkPut(cleared)
  })
  for (const m of cleared) await enqueuePut('match', m.id, m)
  return cleared.length
}

/** The hand-entered results, in bulk. No cascade: nothing references them. */
export const deleteAllResults = async () => {
  const ids = (await db.results.toArray()).map((r) => r.id)
  await db.results.clear()
  for (const id of ids) await enqueueDel('result', id)
}

/** A club's trainings, in bulk. Their `playIds` go with them: sessions cite plays,
 *  never the other way round. */
export const deleteTrainingsOfClub = async (clubId: string) => {
  const ids = (await db.trainings.toArray()).filter((t) => t.clubId === clubId).map((t) => t.id)
  await db.trainings.bulkDelete(ids)
  for (const id of ids) await enqueueDel('training', id)
}

/** A club's plays, in bulk, and their ids removed from the sessions that cited them
 *  — the same cascade as `deletePlay`, otherwise the cleanup would leave orphan ids
 *  behind in the trainings it kept. */
export const deletePlaysOfClub = async (clubId: string) => {
  let removed: string[] = []
  let pruned: Training[] = []
  await db.transaction('rw', db.plays, db.trainings, async () => {
    removed = await db.plays.where('clubId').equals(clubId).primaryKeys()
    await db.plays.bulkDelete(removed)
    const sessions = (await db.trainings.toArray()).filter((t) => t.playIds?.some((pid) => removed.includes(pid)))
    pruned = sessions.map((t) => ({ ...t, playIds: t.playIds!.filter((pid) => !removed.includes(pid)) }))
    await db.trainings.bulkPut(pruned)
  })
  for (const id of removed) await enqueueDel('play', id)
  for (const t of pruned) await enqueuePut('training', t.id, t)
}

/** A full device reset: every table, sync queue included. The queue goes without
 *  being pushed, deliberately — a local wipe must not propagate to the server and
 *  empty the other devices in the same breath. */
export const wipeAll = () =>
  // The tables go through an array: beyond five, Dexie no longer takes them one by one.
  db.transaction('rw', [db.teams, db.players, db.matches, db.results, db.convocations, db.trainings, db.plays, db.messages, db.outbox], async () => {
    await Promise.all([
      db.teams.clear(), db.players.clear(), db.matches.clear(), db.results.clear(),
      db.convocations.clear(), db.trainings.clear(), db.plays.clear(), db.messages.clear(), db.outbox.clear(),
    ])
  })
