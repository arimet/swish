import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { listTeams } from '../persistence/repositories'
import type { Team } from '../domain/types'

/** Club suivi par cet appareil. Préférence locale, jamais synchronisée : deux
 *  personnes du même club ne partagent pas forcément le même appareil, et une
 *  tablette prêtée à l'adversaire n'a pas à lui pousser ce réglage. */
const KEY = 'swish-club-id'

interface ClubCtx {
  clubId: string | null
  club: Team | null
  teams: Team[]
  /** `false` tant que les équipes ne sont pas chargées : sans cela, l'écran de
   *  bienvenue clignoterait à chaque démarrage avant que le club soit résolu. */
  ready: boolean
  setClub: (id: string) => void
  clear: () => void
}
const Ctx = createContext<ClubCtx | null>(null)

export function ClubProvider({ children }: { children: ReactNode }) {
  const [clubId, setClubId] = useState<string | null>(() => localStorage.getItem(KEY))
  const [teams, setTeams] = useState<Team[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    listTeams().then((ts) => {
      if (cancelled) return
      setTeams(ts)
      // Équipe supprimée depuis un autre appareil : on oublie le réglage plutôt
      // que de laisser l'application sur un tableau de bord vide sans issue.
      setClubId((id) => (id && ts.some((t) => t.id === id) ? id : null))
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  const setClub = useCallback((id: string) => { localStorage.setItem(KEY, id); setClubId(id) }, [])
  const clear = useCallback(() => { localStorage.removeItem(KEY); setClubId(null) }, [])

  const club = teams.find((t) => t.id === clubId) ?? null
  return <Ctx.Provider value={{ clubId, club, teams, ready, setClub, clear }}>{children}</Ctx.Provider>
}

export function useClub(): ClubCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClub doit être utilisé dans un ClubProvider')
  return ctx
}
