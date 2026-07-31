import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Mot de passe admin : « admin » par défaut, surchargé par VITE_ADMIN_PASSWORD.
 * Déverrouillage mémorisé pour la session de l'onglet (sessionStorage). */
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined)?.trim() || 'admin'
const KEY = 'admin-unlocked'

interface AdminCtx {
  isAdmin: boolean
  lock: () => void
  /** Exécute l'action si admin, sinon ouvre la demande de mot de passe. */
  guard: (action: () => void) => void
}
const Ctx = createContext<AdminCtx | null>(null)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem(KEY) === '1')
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const pending = useRef<(() => void) | null>(null)

  const lock = useCallback(() => { sessionStorage.removeItem(KEY); setIsAdmin(false) }, [])

  const guard = useCallback((action: () => void) => {
    if (sessionStorage.getItem(KEY) === '1') { action(); return }
    pending.current = action; setPw(''); setError(''); setOpen(true)
  }, [])

  const close = () => { setOpen(false); pending.current = null }
  const submit = () => {
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem(KEY, '1'); setIsAdmin(true); setOpen(false)
      const fn = pending.current; pending.current = null; fn?.()
    } else setError('Mot de passe incorrect.')
  }

  return (
    <Ctx.Provider value={{ isAdmin, lock, guard }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-xs border-none bg-[#161618] p-5 text-white [&>button]:text-white/60">
          <DialogHeader><DialogTitle className="text-lg font-extrabold">🔒 Accès administrateur</DialogTitle></DialogHeader>
          <p className="text-[13px]" style={{ color: '#8a8a90' }}>Requis pour ajouter des informations et démarrer une rencontre.</p>
          <input
            autoFocus type="password" value={pw} placeholder="Mot de passe"
            onChange={(e) => { setPw(e.target.value); setError('') }}
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

export function useAdmin(): AdminCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAdmin doit être utilisé dans <AdminProvider>')
  return c
}
