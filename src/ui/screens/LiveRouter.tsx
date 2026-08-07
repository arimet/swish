import { useEffect, useState } from 'react'
import { LiveMatch } from './LiveMatch'
import { SoloLiveMatch } from './SoloLiveMatch'
import { getMatch } from '../../persistence/repositories'

/**
 * `/match/:id/live` sert deux écrans selon le mode de la rencontre. L'URL est
 * commune pour que tous les liens existants (accueil, calendrier, fiche équipe)
 * restent valides sans modification.
 */
export function LiveRouter({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const [solo, setSolo] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    getMatch(matchId).then((m) => { if (!cancelled) setSolo(m?.meta.solo === true) })
    return () => { cancelled = true }
  }, [matchId])

  if (solo === null) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>
  return solo ? <SoloLiveMatch matchId={matchId} onFinish={onFinish} /> : <LiveMatch matchId={matchId} onFinish={onFinish} />
}
