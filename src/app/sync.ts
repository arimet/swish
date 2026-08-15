import type { Match, Player, TeamSide } from '../domain/types'

/** Bundle publié pour le suivi spectateur : tout ce dont la page a besoin,
 * y compris les joueurs (un appareil distant n'a pas la base locale). */
export interface SyncBundle {
  match: Match
  players: Player[]
  teamNames: Record<TeamSide, string>
}

/* Il n'y a plus rien à publier : le paquet est **dérivé** de la base par
   `api/_bundle`, et la rencontre y arrive déjà par la file d'attente de la table
   de marque. Publier une seconde fois, c'était deux chemins d'écriture pour une
   même donnée — avec deux façons de se contredire — et une durée de vie de douze
   heures au bout de laquelle le suivi d'un match du matin s'éteignait. */

// Activé uniquement si VITE_SYNC_URL est défini (ex. "/api" sur Vercel).
// Sinon l'app reste 100 % locale (aucun appel réseau).
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

/** S'abonne au flux temps réel (SSE) d'une rencontre ; repli sur polling si indisponible.
 * Renvoie une fonction de désabonnement. */
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
    es.onerror = () => { startPoll() } // EventSource retente seul ; polling en filet de sécurité
  } else {
    startPoll()
  }

  return () => { es?.close(); if (poll) clearInterval(poll) }
}
