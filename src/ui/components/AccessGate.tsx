import { Link } from 'react-router-dom'
import { Eye, Lock, LockOpen } from 'lucide-react'
import { REQUIRED, type Ability } from '../../app/auth'
import { useT } from '../../i18n'
import { C } from '../olive/kit'

/**
 * Lock screen: recording the game is reserved for whoever holds the required
 * access, spectators go through /watch (read-only). The label names the missing
 * access, so that a volunteer understands they need a different code rather than
 * believing theirs is broken.
 */
export function AccessGate({ ability, matchId, onUnlock, onExit }: { ability: Ability; matchId: string; onUnlock: () => void; onExit: () => void }) {
  const translate = useT()
  const accessName = translate(`role.${REQUIRED[ability]}`)
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: C.frame, color: C.text }}>
      {/* The padlock is drawn as a stroke and takes the text colour, like the
          application's other marks: the five-rem yellow emoji that sat here was the
          only coloured object on an otherwise monochrome screen. */}
      <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: C.accentBg, color: C.accent }}>
        <Lock className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h2 className="text-2xl font-extrabold tracking-tight">{translate('gate.title', { role: accessName })}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{translate('gate.explanation', { role: accessName.toLowerCase() })}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button onClick={onUnlock} className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110">
          <LockOpen className="h-4 w-4" strokeWidth={2} />
          {translate('access.unlock')}
        </button>
        <Link to={`/match/${matchId}/watch`} className="flex items-center gap-2 rounded-xl border border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted">
          <Eye className="h-4 w-4" strokeWidth={2} />
          {translate('gate.spectatorView')}
        </Link>
      </div>
      <button onClick={onExit} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground">{translate('gate.home')}</button>
    </div>
  )
}
