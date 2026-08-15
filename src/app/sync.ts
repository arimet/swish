import type { Match, Player, TeamSide } from '../domain/types'

/** Bundle published for the spectator view: everything the page needs, players
 * included (a remote device has no local database). */
export interface SyncBundle {
  match: Match
  players: Player[]
  teamNames: Record<TeamSide, string>
}

/* There is nothing left to publish: the bundle is **derived** from the database by
   `api/_bundle`, and the game already arrives there through the scorer's table
   queue. Publishing a second time meant two write paths for the same data — with
   two ways to contradict each other — and a twelve-hour lifetime after which the
   live view of a morning game went dark. */

// Enabled only if VITE_SYNC_URL is set (e.g. "/api" on Vercel). Otherwise the app
// stays 100% local (no network call).
const BASE = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/+$/, '') || ''

export const syncEnabled = (): boolean => BASE !== ''

export async function fetchBundle(id: string): Promise<SyncBundle | null> {
  if (!BASE) return null
  try {
    const r = await fetch(`${BASE}/match/${id}`)
    if (!r.ok) return null
    return (await r.json()) as SyncBundle
  } catch { return null }
}

/** Subscribes to a game's real-time (SSE) stream; falls back to polling when
 * unavailable. Returns an unsubscribe function. */
export function subscribeBundle(id: string, onData: (b: SyncBundle) => void): () => void {
  if (!BASE) return () => {}
  let es: EventSource | null = null
  let poll: number | undefined
  const startPoll = () => {
    if (poll) return
    poll = window.setInterval(async () => { const b = await fetchBundle(id); if (b) onData(b) }, 2500)
  }

  if (typeof EventSource !== 'undefined') {
    es = new EventSource(`${BASE}/match/${id}/stream`)
    es.onmessage = (e) => { try { onData(JSON.parse(e.data) as SyncBundle) } catch { /* ignore */ } }
    es.onerror = () => { startPoll() } // EventSource retries on its own; polling is the safety net
  } else {
    startPoll()
  }

  return () => { es?.close(); if (poll) clearInterval(poll) }
}
