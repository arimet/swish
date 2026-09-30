import { list, get, mutate, writeEvents, type Op } from './api'
import { hasEvents } from '../domain/cleanup'
import { diffEvents, sameHead } from '../domain/sync'
import type { Team, Player, Match, ReportedResult, Convocation, Training, TeamMessage } from '../domain/types'
import type { Play } from '../domain/plays'

/*
 * Reads and writes, straight to the database. There is nothing between this file
 * and `api/`: no mirror to keep in step, no queue to flush, no cascade that can be
 * forgotten on one of the two sides.
 *
 * TWO THINGS TO KNOW BEFORE TOUCHING ANY OF IT.
 *
 * **Deleting archives.** The server never deletes a row: a `del` sets `archived_at`,
 * and its views hide whatever hangs off an archived row — a team's players, games,
 * results, sessions, plays and message; a player in the call-ups; a play in the
 * sessions. So a deletion here is one op, and there is no cascade left to forget.
 *
 * **A write replaces**, every kind alike, except a game's events: `api/mutate`
 * applies the document that arrives and keeps nothing of the one stored. So what a
 * screen sends is what the database will hold — which is only safe because the
 * screen read that document from the database in the first place.
 *
 * The lists are club-sized — a roster, a season's fixtures — so filtering in memory
 * is cheaper than teaching the API a query language it would use twice.
 */

const one = (kind: Op['kind'], id: string, doc: unknown): Promise<void> => mutate([{ kind, op: 'put', id, doc }])
const gone = (kind: Op['kind'], id: string): Promise<void> => mutate([{ kind, op: 'del', id }])

export const saveTeam = (t: Team) => one('team', t.id, t)
export const getTeam = (id: string) => get<Team>('team', id)
export const listTeams = () => list<Team>('team')

export const deleteTeam = (id: string) => gone('team', id)

export const savePlayer = (p: Player) => one('player', p.id, p)
export const getPlayer = (id: string) => get<Player>('player', id)
/** Every player of every team. The screens want a roster, not this — but the cache
 *  wants one entry per kind, so `usePlayers` reads this and filters. See `queries.ts`. */
export const listAllPlayers = () => list<Player>('player')
export const listPlayers = async (teamId: string) => (await listAllPlayers()).filter((p) => p.teamId === teamId)
export const deletePlayer = (id: string) => gone('player', id)

/** A game's head — meta, status, roster — sent with no events: those go through
 *  `saveSheet`, and the server refuses a game's `put` that still carries some. */
export const saveMatch = (m: Match) => one('match', m.id, { ...m, events: [] })
export const getMatch = (id: string) => get<Match>('match', id)
export const listMatches = () => list<Match>('match')
/** Archives the game. Its call-up follows it through the server's views. */
export const deleteMatch = (id: string) => gone('match', id)

/**
 * Writes what changed between two versions of a game: its head (meta, status, roster)
 * when it changed, then the events added and archived.
 *
 * In that order, because an event needs its game: a sheet created and scored in one
 * call must exist before its first basket. The two are separate requests, and that is
 * accepted — a head written without its events leaves a correct game with less on it,
 * never a basket pointing at nothing.
 */
export async function saveSheet(before: Match | null, after: Match): Promise<void> {
  if (!before || !sameHead(before, after)) await saveMatch(after)
  const { add, archive } = diffEvents(before?.events ?? [], after.events)
  await writeEvents(after.id, add, archive)
}

export const listResults = () => list<ReportedResult>('result')
export const saveResult = (r: ReportedResult) => one('result', r.id, r)
export const deleteResult = (id: string) => gone('result', id)

/** The call-up is filed under **the game** rather than under an id of its own:
 *  there is one per game, and writing on that key makes replacement free. */
export const getConvocation = (matchId: string) => get<Convocation>('convocation', matchId)
export const saveConvocation = (c: Convocation) => one('convocation', c.matchId, c)

export const listTrainings = () => list<Training>('training')
export const saveTraining = (t: Training) => one('training', t.id, t)
export const deleteTraining = (id: string) => gone('training', id)

/** The coach's message to the team: one per club, filed **under the club**, which
 *  therefore serves as its key. Writing a new one replaces the previous, and
 *  deleting the team takes it along (cf. `deleteTeam`). */
export const getMessage = (clubId: string) => get<TeamMessage>('message', clubId)
export const saveMessage = (m: TeamMessage) => one('message', m.clubId, m)
export const deleteMessage = (clubId: string) => gone('message', clubId)

/* A toggle reads the session before it writes it, so two ticks launched in one round
   trip would both start from the same session and the second write would erase the
   first. They run one after another instead. */
let toggling: Promise<unknown> = Promise.resolve()

/** Attaches a play to a training session, or detaches it.
 *
 *  ponytail: the chain covers one tab; two devices ticking at the same instant can
 *  still cross. A per-field API endpoint would cost more than the defect it prevents. */
export const toggleTrainingPlay = (trainingId: string, playId: string) => {
  const next = toggling.then(async () => {
    const training = await get<Training>('training', trainingId)
    if (!training) return
    const ids = training.playIds ?? []
    await one('training', training.id, { ...training, playIds: ids.includes(playId) ? ids.filter((id) => id !== playId) : [...ids, playId] })
  })
  // A failed toggle must not jam the next one.
  toggling = next.catch(() => undefined)
  return next
}

/** The playbook belongs to the club. */
/** Every play of every club, for the same reason as `listAllPlayers`. */
export const listAllPlays = () => list<Play>('play')
export const listPlays = async (clubId: string) => (await listAllPlays()).filter((s) => s.clubId === clubId)
export const getPlay = (id: string) => get<Play>('play', id)
/** Stamps the time on save: without `updatedAt` the library would only have the
 *  database's order, which is to say none, and would look shuffled at every
 *  opening. */
export const savePlay = (s: Play) => {
  const written = { ...s, updatedAt: new Date().toISOString() }
  return one('play', written.id, written)
}
export const deletePlay = (id: string) => gone('play', id)

// ── Administrative cleanup ──────────────────────────────────────────────────
// Bulk archiving, and it reaches the shared database: what is archived here disappears
// for everyone. `Admin.tsx` says so before asking for a confirmation.

/** Archives the games matching the filter; their call-ups follow them. Returns the
 *  archived ids, enough to report what actually disappeared. */
export const deleteMatchesWhere = async (filter: (m: Match) => boolean): Promise<string[]> => {
  const ids = (await listMatches()).filter(filter).map((m) => m.id)
  await mutate(ids.map((id): Op => ({ kind: 'match', op: 'del', id })))
  return ids
}

/** Empties a club's game sheets: the recorded events go, the game, its date and its
 *  call-up stay. The status drops back to "upcoming" — a "finished" game without a
 *  single event would show 0–0 everywhere, like a score actually observed. */
export const clearClubStats = async (clubId: string): Promise<number> => {
  const full = (await listMatches()).filter(hasEvents(clubId))
  for (const m of full) await saveSheet(m, { ...m, events: [], status: 'setup' })
  return full.length
}

/** The hand-entered results, in bulk. Nothing hangs off them. */
export const deleteAllResults = async () => {
  const ids = (await listResults()).map((r) => r.id)
  await mutate(ids.map((id): Op => ({ kind: 'result', op: 'del', id })))
}

/** A club's trainings, in bulk. Sessions cite plays, never the other way round. */
export const deleteTrainingsOfClub = async (clubId: string) => {
  const ids = (await listTrainings()).filter((t) => t.clubId === clubId).map((t) => t.id)
  await mutate(ids.map((id): Op => ({ kind: 'training', op: 'del', id })))
}

/** A club's plays, in bulk; the sessions that cited them stop listing them by the views. */
export const deletePlaysOfClub = async (clubId: string) => {
  const ids = (await listAllPlays()).filter((s) => s.clubId === clubId).map((s) => s.id)
  await mutate(ids.map((id): Op => ({ kind: 'play', op: 'del', id })))
}

/** Archives every document, one transaction. */
export const wipeAll = async () => {
  // Call-ups are left out: they follow their games.
  type Kind = Exclude<Op['kind'], 'convocation'>
  const kinds: Kind[] = ['team', 'player', 'match', 'result', 'training', 'play', 'message']
  // The key is not always `id`: the message is filed under its club. Each kind
  // therefore says which field to delete it by.
  const keyOf: Record<Kind, (d: Record<string, string>) => string> = {
    team: (d) => d.id, player: (d) => d.id, match: (d) => d.id, result: (d) => d.id,
    training: (d) => d.id, play: (d) => d.id, message: (d) => d.clubId,
  }
  const batches = await Promise.all(kinds.map(async (kind) =>
    (await list<Record<string, string>>(kind)).map((d): Op => ({ kind, op: 'del', id: keyOf[kind](d) }))))
  await mutate(batches.flat())
}
