import type { Match, Player, TeamSide } from '../domain/types'

/** Bundle published for the spectator view: everything the page needs, players
 * included. It is projected out of the database by `api/_bundle` — the spectator
 * page reads nothing else, and writes nothing at all. */
export interface SpectatorBundle {
  match: Match
  players: Player[]
  teamNames: Record<TeamSide, string>
}

const BASE = '/api'

export async function fetchBundle(id: string): Promise<SpectatorBundle | null> {
  try {
    const r = await fetch(`${BASE}/match/${id}`)
    if (!r.ok) return null
    return (await r.json()) as SpectatorBundle
  } catch { return null }
}

/** Subscribes to a game's real-time (SSE) stream; falls back to polling when
 * unavailable. Returns an unsubscribe function. */
export function subscribeBundle(id: string, onData: (b: SpectatorBundle) => void): () => void {
  let es: EventSource | null = null
  let poll: number | undefined
  const startPoll = () => {
    if (poll) return
    poll = window.setInterval(async () => { const b = await fetchBundle(id); if (b) onData(b) }, 2500)
  }

  if (typeof EventSource !== 'undefined') {
    es = new EventSource(`${BASE}/match/${id}/stream`)
    es.onmessage = (e) => { try { onData(JSON.parse(e.data) as SpectatorBundle) } catch { /* ignore */ } }
    es.onerror = () => { startPoll() } // EventSource retries on its own; polling is the safety net
  } else {
    startPoll()
  }

  return () => { es?.close(); if (poll) clearInterval(poll) }
}
