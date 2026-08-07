import { useEffect, useState } from 'react'
import { LiveMatch } from './LiveMatch'
import { SoloLiveMatch } from './SoloLiveMatch'
import { getMatch } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

/**
 * `/match/:id/live` sert deux écrans selon le mode de la rencontre. L'URL est
 * commune pour que tous les liens existants (accueil, calendrier, fiche équipe)
 * restent valides sans modification.
 */
export function LiveRouter({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    getMatch(matchId).then((m) => { if (!cancelled) setMatch(m ?? null) })
    return () => { cancelled = true }
  }, [matchId])

  if (match === undefined) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>
  if (match === null) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Rencontre introuvable.</div>
  return match.meta.solo ? <SoloLiveMatch matchId={matchId} onFinish={onFinish} /> : <LiveMatch matchId={matchId} onFinish={onFinish} />
}
