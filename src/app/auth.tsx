import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Ce qu'on peut écrire dans l'application. Un visiteur ne modifie rien, la
 *  table de marque saisit la rencontre, l'administrateur gère le club. */
export type Role = 'visiteur' | 'marque' | 'admin'

/** Ce qu'une action demande comme droit. */
export type Ability = 'score' | 'manage'

/** Qui peut quoi. Un administrateur tient aussi la table de marque : c'est le cas
 *  courant du coach qui saisit lui-même faute de bénévole. L'inverse est faux. */
const DROITS: Record<Role, Ability[]> = {
  visiteur: [],
  marque: ['score'],
  admin: ['score', 'manage'],
}

/** Libellés des accès, pour que la demande de code dise lequel elle réclame. */
export const NOM_ROLE: Record<Role, string> = {
  visiteur: 'Visiteur',
  marque: 'Table de marque',
  admin: 'Administrateur',
}

/** L'accès minimal qui accorde chaque droit — sert à nommer ce qu'il faut saisir. */
export const REQUIS: Record<Ability, Role> = { score: 'marque', manage: 'admin' }

const CODES: Record<Role, string> = {
  visiteur: '',
  marque: (import.meta.env.VITE_SCORER_PASSWORD as string | undefined)?.trim() || 'marque',
  admin: (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined)?.trim() || 'admin',
}
/** Le code joueur n'accorde aucun droit d'écriture : il ouvre le choix du nom
 *  dans l'effectif, indépendamment du rôle courant (un joueur peut aussi être
 *  la table de marque, ou n'avoir aucun droit d'écriture). */
const CODE_JOUEUR = (import.meta.env.VITE_PLAYER_PASSWORD as string | undefined)?.trim() || 'joueur'

/** Rôle mémorisé pour la session de l'onglet (sessionStorage) : un bénévole qui
 *  ferme l'onglet ne laisse pas la table de marque déverrouillée derrière lui. */
export const ROLE_KEY = 'swish-role'
/** Identité de joueur mémorisée sur l'appareil (localStorage) : on ne redemande
 *  pas « qui es-tu » à chaque ouverture, contrairement au rôle. */
export const PLAYER_ID_KEY = 'swish-player-id'

const estRole = (v: string | null): v is Role => v === 'marque' || v === 'admin'

interface AuthCtx {
  role: Role
  playerId: string | null
  /** L'action demande-t-elle un droit que le rôle courant possède ? */
  can: (ability: Ability) => boolean
  /** Compare le code aux trois codes de rôle et au code joueur. Renvoie le rôle
   *  obtenu, `'joueur'` si le code ouvre le choix du joueur sans changer de rôle,
   *  ou `null` si le code est inconnu — le rôle courant n'est alors pas modifié. */
  unlock: (code: string) => Role | 'joueur' | null
  lock: () => void
  setPlayer: (id: string | null) => void
  /** Exécute l'action si le rôle courant a le droit demandé, sinon ouvre la
   *  demande de code en nommant l'accès requis. */
  guard: (ability: Ability, action: () => void) => void
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(() => {
    const stored = sessionStorage.getItem(ROLE_KEY)
    return estRole(stored) ? stored : 'visiteur'
  })
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem(PLAYER_ID_KEY))
  const [pending, setPending] = useState<{ ability: Ability; action: () => void } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const can = useCallback((ability: Ability) => DROITS[role].includes(ability), [role])

  const unlock = useCallback((value: string): Role | 'joueur' | null => {
    if (value === CODE_JOUEUR) return 'joueur'
    const obtained = (Object.keys(CODES) as Role[]).find((r) => r !== 'visiteur' && CODES[r] === value)
    if (!obtained) return null
    sessionStorage.setItem(ROLE_KEY, obtained)
    setRole(obtained)
    return obtained
  }, [])

  const lock = useCallback(() => { sessionStorage.removeItem(ROLE_KEY); setRole('visiteur') }, [])

  const setPlayer = useCallback((id: string | null) => {
    if (id) localStorage.setItem(PLAYER_ID_KEY, id)
    else localStorage.removeItem(PLAYER_ID_KEY)
    setPlayerId(id)
  }, [])

  const guard = useCallback((ability: Ability, action: () => void) => {
    if (DROITS[role].includes(ability)) { action(); return }
    setCode(''); setError(''); setPending({ ability, action })
  }, [role])

  const close = () => setPending(null)
  const submit = () => {
    if (!pending) return
    const obtained = unlock(code)
    if (obtained && obtained !== 'joueur' && DROITS[obtained].includes(pending.ability)) {
      const { action } = pending
      setPending(null)
      action()
    } else {
      setError(`Code ${NOM_ROLE[REQUIS[pending.ability]]} requis.`)
    }
  }

  return (
    <Ctx.Provider value={{ role, playerId, can, unlock, lock, setPlayer, guard }}>
      {children}
      <Dialog open={!!pending} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-xs border-none bg-[#161618] p-5 text-white [&>button]:text-white/60">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">
              🔒 Accès {pending ? NOM_ROLE[REQUIS[pending.ability]] : ''} requis
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: '#8a8a90' }}>Cette action nécessite ce code d'accès.</p>
          <input
            autoFocus type="password" value={code} placeholder="Code"
            onChange={(e) => { setCode(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className={`mt-2 w-full rounded-xl border bg-[#202024] px-4 py-3 text-sm outline-none transition ${error ? 'border-red-500/60' : 'border-white/10 focus:border-[#ff4d6d]'}`}
          />
          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={close} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-bold transition hover:bg-white/20">Annuler</button>
            <button onClick={submit} className="flex-1 rounded-xl bg-[#ff4d6d] py-2.5 text-sm font-bold text-white transition hover:brightness-110">Déverrouiller</button>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return c
}
