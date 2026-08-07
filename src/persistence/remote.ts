import { db, type OutboxItem } from './db'
import type { Match, Player, Team } from '../domain/types'

/** Synchronisation local-first des entités partagées (équipes, joueurs, matchs)
 * via l'API serveur (Upstash Redis). Activée uniquement si VITE_SYNC_URL est défini
 * — sinon l'app reste 100 % locale (aucune écriture dans la file, aucun appel réseau). */
const BASE = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/+$/, '') || ''
export const remoteEnabled = (): boolean => BASE !== ''

type Kind = OutboxItem['kind']

/** Récupère l'état partagé complet depuis le serveur. */
export async function pullAll(): Promise<{ teams: Team[]; players: Player[]; matches: Match[] } | null> {
  if (!BASE) return null
  try {
    const r = await fetch(`${BASE}/state`)
    if (!r.ok) return null
    return (await r.json()) as { teams: Team[]; players: Player[]; matches: Match[] }
  } catch { return null }
}

/** Hydrate le cache local (IndexedDB) depuis le serveur.
 * On vide d'abord la file sortante : sinon une écriture encore en attente du
 * débounce (ex. correction de stats juste avant un clic qui déclenche une
 * hydratation) serait écrasée par l'état serveur, pas encore au courant. */
export async function hydrate(): Promise<boolean> {
  clearTimeout(timer)
  await doFlush()
  const s = await pullAll()
  if (!s) return false
  await db.transaction('rw', db.teams, db.players, db.matches, async () => {
    if (s.teams?.length) await db.teams.bulkPut(s.teams)
    if (s.players?.length) await db.players.bulkPut(s.players)
    if (s.matches?.length) await db.matches.bulkPut(s.matches)
  })
  return true
}

/** Rafraîchit depuis le serveur (à appeler à l'ouverture des pages de listes). */
export async function refresh(): Promise<void> { if (BASE) await hydrate() }

// --- File d'attente sortante ---
async function enqueue(op: Omit<OutboxItem, 'ts' | 'seq'>): Promise<void> {
  if (!BASE) return // mode local : rien à synchroniser
  await db.outbox.add({ ...op, ts: Date.now() })
  flush()
}
export const enqueuePut = (kind: Kind, id: string, doc: unknown) => enqueue({ kind, op: 'put', id, doc })
export const enqueueDel = (kind: Kind, id: string) => enqueue({ kind, op: 'del', id })

// Promesse du flush en cours, le cas échéant. Sert de verrou (un seul flush
// réseau à la fois) ET permet à hydrate() d'attendre un flush déjà démarré au
// lieu de l'ignorer (sinon la file pourrait se vider « en même temps » qu'une
// hydratation sans que celle-ci n'ait jamais attendu son résultat).
let inflight: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** Vide la file vers le serveur (dédupliquée par entité). Débounce par défaut. */
export function flush(delay = 700): void {
  if (!BASE) return
  clearTimeout(timer)
  timer = setTimeout(() => { void doFlush() }, delay)
}

function doFlush(): Promise<void> {
  if (!BASE) return Promise.resolve()
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const items = await db.outbox.orderBy('seq').toArray()
      if (items.length) {
        // Déduplication : on ne garde que la dernière opération par (kind:id).
        const byKey = new Map<string, OutboxItem>()
        for (const it of items) byKey.set(`${it.kind}:${it.id}`, it)
        const ops = [...byKey.values()].map((it) =>
          it.op === 'del' ? { kind: it.kind, op: it.op, id: it.id } : { kind: it.kind, op: it.op, id: it.id, doc: it.doc })
        const r = await fetch(`${BASE}/mutate`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ops }), keepalive: true,
        })
        if (r.ok) await db.outbox.bulkDelete(items.map((i) => i.seq!))
      }
    } catch { /* hors-ligne : on garde la file pour un prochain essai */ } finally {
      inflight = null
    }
  })()
  return inflight
}

// Vide la file dès que la connexion revient.
if (typeof window !== 'undefined' && BASE) window.addEventListener('online', () => flush(0))
