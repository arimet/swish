import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { listTeams } from '../persistence/repositories'
import type { Team } from '../domain/types'

/** The club this device follows. A local preference, never synchronised: two
 *  people from the same club do not necessarily share a device, and a tablet lent
 *  to the opposition has no business pushing this setting onto them. */
export const CLUB_ID_KEY = 'swish-club-id'
const KEY = CLUB_ID_KEY

interface ClubCtx {
  clubId: string | null
  club: Team | null
  teams: Team[]
  /** `false` until the teams are loaded: without it the welcome screen would flash
   *  at every start before the club is resolved. */
  ready: boolean
  /** The team list could not be read. Distinct from "there is no team": one is a
   *  server that is not answering, the other is a club to create, and offering
   *  "create your team" to someone whose network is down invites a duplicate. */
  unreachable: boolean
  setClub: (id: string) => void
  clear: () => void
}
const Ctx = createContext<ClubCtx | null>(null)

export function ClubProvider({ children }: { children: ReactNode }) {
  const [clubId, setClubId] = useState<string | null>(() => localStorage.getItem(KEY))
  const [teams, setTeams] = useState<Team[]>([])
  const [ready, setReady] = useState(false)
  const [unreachable, setUnreachable] = useState(false)
  // Incremented on every club change: forces a re-read of the team list. Without
  // it the effect only runs on mount — a team created or deleted afterwards is
  // never seen again until the page is reloaded.
  const [gen, setGen] = useState(0)

  useEffect(() => {
    let cancelled = false
    listTeams().then((ts) => {
      if (cancelled) return
      setTeams(ts)
      setUnreachable(false)
      // Team deleted from another device: we forget the setting rather than leave
      // the application on an empty dashboard with no way out.
      setClubId((id) => (id && ts.some((t) => t.id === id) ? id : null))
      setReady(true)
    }).catch(() => {
      // The read failed, and this gate stands in front of the whole application: not
      // resolving would leave "Loading…" on screen for ever, with nothing saying why.
      // The club setting is deliberately left alone — a silent server is no reason to
      // forget which club this device follows.
      if (cancelled) return
      setUnreachable(true)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [gen])

  const setClub = useCallback((id: string) => { localStorage.setItem(KEY, id); setClubId(id); setGen((g) => g + 1) }, [])
  const clear = useCallback(() => { localStorage.removeItem(KEY); setClubId(null); setGen((g) => g + 1) }, [])

  const club = teams.find((t) => t.id === clubId) ?? null
  return <Ctx.Provider value={{ clubId, club, teams, ready, unreachable, setClub, clear }}>{children}</Ctx.Provider>
}

export function useClub(): ClubCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClub must be used inside a ClubProvider')
  return ctx
}
