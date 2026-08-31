import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useTeams } from '../persistence/queries'
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
  const [stored, setStored] = useState<string | null>(() => localStorage.getItem(KEY))
  /* One query, shared with every screen that lists teams — the gate no longer reads
     ahead of them. It also replaces the counter this provider used to keep: creating
     or deleting a team is a write, and a write invalidates `['doc', 'team']`, so the
     list refreshes on its own. Bumping a `gen` by hand was the only way to do that
     before, and forgetting to bump it left the application on a team that no longer
     existed until the page was reloaded. */
  const { data, isError } = useTeams()
  const teams = data ?? []

  /**
   * Settled once, settled for good.
   *
   * The gate below shows a waiting screen while this is `false`, so it must not go
   * back: `!isPending` did, on every background refetch, and the cost was not a
   * flicker but a **loop**. Waiting unmounted the shell; the shell's own reads of the
   * team list were what triggered the refetch; the refetch put the gate back to
   * waiting. The application oscillated between the two for as long as the server
   * stayed silent.
   *
   * A ref and not state: it is read during the same render that sets it, and it never
   * causes one of its own.
   */
  const settled = useRef(false)
  if (data !== undefined || isError) settled.current = true

  /**
   * The club, resolved rather than stored twice.
   *
   * Two behaviours, and they pull in opposite directions, which is why this is one
   * expression and not an effect. **On a good read** — the only case where `data` is
   * defined — a setting naming a team the database no longer holds is dropped: the team
   * was deleted from another device, and leaving it would strand the application on an
   * empty dashboard with no way out. **While there is no good read**, loading or
   * failed alike, the setting stands: a silent server is no reason to forget which club
   * this device follows, and `ClubGate` lets such a device through with the header pill
   * saying the rest.
   *
   * It turns on `data`, and deliberately not on `isError`: that flag drops on every
   * refetch, and a club that disappears for one render unmounts the whole shell. See
   * `settled` above — the two were one loop.
   */
  const clubId = stored && (data === undefined || teams.some((t) => t.id === stored)) ? stored : null

  const setClub = useCallback((id: string) => { localStorage.setItem(KEY, id); setStored(id) }, [])
  const clear = useCallback(() => { localStorage.removeItem(KEY); setStored(null) }, [])

  const club = teams.find((t) => t.id === clubId) ?? null
  return (
    <Ctx.Provider value={{ clubId, club, teams, ready: settled.current, unreachable: isError, setClub, clear }}>
      {children}
    </Ctx.Provider>
  )
}

export function useClub(): ClubCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClub must be used inside a ClubProvider')
  return ctx
}
