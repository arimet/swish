import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { C } from '../ui/olive/kit'
import { useT } from '../i18n'
import { Lock } from 'lucide-react'

/** What one may write in the application. A visitor changes nothing, the scorer's
 *  table records the game, the administrator runs the club. */
export type Role = 'visitor' | 'scorer' | 'admin'

/** The right an action demands. */
export type Ability = 'score' | 'manage'

/** Who may do what. An administrator also keeps the scorer's table: that is the
 *  common case of the coach recording the game for want of a volunteer. The
 *  converse is false. */
const RIGHTS: Record<Role, Ability[]> = {
  visitor: [],
  scorer: ['score'],
  admin: ['score', 'manage'],
}

/** The minimum access that grants each right. It is what names the code to ask for. */
export const REQUIRED: Record<Ability, Role> = { score: 'scorer', manage: 'admin' }

/** Only the roles one acquires have a code: "visitor" is the default state, not
 *  something you unlock. */
const CODES: Record<Exclude<Role, 'visitor'>, string> = {
  scorer: (import.meta.env.VITE_SCORER_PASSWORD as string | undefined)?.trim() || 'marque',
  admin: (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined)?.trim() || 'admin',
}
/** The player code grants no write right: it opens the choice of a name in the
 *  roster, independently of the current role (a player may also be the scorer's
 *  table, or have no write right at all). */
const PLAYER_CODE = (import.meta.env.VITE_PLAYER_PASSWORD as string | undefined)?.trim() || 'joueur'

/** Role remembered for the tab's session (sessionStorage): a volunteer who closes
 *  the tab does not leave the scorer's table unlocked behind them. */
export const ROLE_KEY = 'swish-role'
/** Player identity remembered on the device (localStorage): we do not ask "who are
 *  you" at every opening, unlike the role. */
export const PLAYER_ID_KEY = 'swish-player-id'

const isRole = (v: string | null): v is Role => v === 'scorer' || v === 'admin'

interface AuthCtx {
  role: Role
  playerId: string | null
  /** Does the action demand a right the current role holds? */
  can: (ability: Ability) => boolean
  /** Compares the code against the role codes and the player code. Returns the role
   *  obtained, `'player'` if the code opens the player choice without changing role,
   *  or `null` if the code is unknown — the current role is then left alone. */
  unlock: (code: string) => Role | 'player' | null
  lock: () => void
  /**
   * Grants administrator access **without a code**, reserved for founding the club.
   *
   * A door that opens without a key needs justifying. The first arrival on a blank
   * install creates their team from the welcome screen, and that creation is already
   * ungated — it is the way out the screen offers, it could not ask for a code for
   * the one action that makes the application usable. An empty install therefore has
   * nothing to protect: the administrator code does not defend access, it defends
   * data, and there is none. Refusing the right at that precise moment protected
   * nothing and left the founder in front of six empty blocks without a single
   * button.
   *
   * What follows stays guarded as before: the role lives in `sessionStorage`, so it
   * dies with the tab, and any other device goes through the code.
   */
  found: () => void
  setPlayer: (id: string | null) => void
  /** Runs the action if the current role has the right asked for, otherwise opens
   *  the code prompt naming the access required. */
  guard: (ability: Ability, action: () => void) => void
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const translate = useT()
  const [role, setRole] = useState<Role>(() => {
    const stored = sessionStorage.getItem(ROLE_KEY)
    return isRole(stored) ? stored : 'visitor'
  })
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem(PLAYER_ID_KEY))
  const [pending, setPending] = useState<{ ability: Ability; action: () => void } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const can = useCallback((ability: Ability) => RIGHTS[role].includes(ability), [role])

  const unlock = useCallback((value: string): Role | 'player' | null => {
    if (value === PLAYER_CODE) return 'player'
    const obtained = (Object.keys(CODES) as (keyof typeof CODES)[]).find((r) => CODES[r] === value)
    if (!obtained) return null
    sessionStorage.setItem(ROLE_KEY, obtained)
    setRole(obtained)
    return obtained
  }, [])

  const lock = useCallback(() => { sessionStorage.removeItem(ROLE_KEY); setRole('visitor') }, [])

  const found = useCallback(() => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    setRole('admin')
  }, [])

  const setPlayer = useCallback((id: string | null) => {
    if (id) localStorage.setItem(PLAYER_ID_KEY, id)
    else localStorage.removeItem(PLAYER_ID_KEY)
    setPlayerId(id)
  }, [])

  const guard = useCallback((ability: Ability, action: () => void) => {
    if (RIGHTS[role].includes(ability)) { action(); return }
    setCode(''); setError(''); setPending({ ability, action })
  }, [role])

  const close = () => setPending(null)
  const submit = () => {
    if (!pending) return
    const obtained = unlock(code)
    if (obtained && obtained !== 'player' && RIGHTS[obtained].includes(pending.ability)) {
      const { action } = pending
      setPending(null)
      action()
    } else {
      setError(translate('access.wrongCode', { role: translate(`role.${REQUIRED[pending.ability]}`) }))
    }
  }

  return (
    <Ctx.Provider value={{ role, playerId, can, unlock, lock, found, setPlayer, guard }}>
      {children}
      <Dialog open={!!pending} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-xs border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">
              <Lock className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              {translate('access.required', { role: pending ? translate(`role.${REQUIRED[pending.ability]}`) : '' })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: C.muted }}>{translate('access.needsCode')}</p>
          <input
            autoFocus type="password" value={code} placeholder={translate('access.codePlaceholder')}
            onChange={(e) => { setCode(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className={`mt-2 w-full rounded-xl border bg-[var(--c-card2)] px-4 py-3 text-sm outline-none transition ${error ? 'border-[var(--c-danger)]' : 'border-[var(--c-border)] focus:border-[var(--c-accent)]'}`}
          />
          {error && <p className="text-xs font-semibold text-[var(--c-danger)]">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={close} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{translate('common.cancel')}</button>
            <button onClick={submit} className="flex-1 rounded-xl bg-[var(--c-brand)] py-2.5 text-sm font-bold text-[var(--c-on-brand)] transition hover:brightness-110">{translate('access.unlock')}</button>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>')
  return c
}
