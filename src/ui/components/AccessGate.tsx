import { Link } from 'react-router-dom'
import { Eye, Lock, LockOpen } from 'lucide-react'
import { NOM_ROLE, REQUIS, type Ability } from '../../app/auth'
import { C } from '../olive/kit'

/**
 * Écran de verrouillage : la saisie du match est réservée à qui détient
 * l'accès requis, les spectateurs passent par /watch (lecture seule). Le
 * libellé nomme l'accès manquant, pour qu'un bénévole comprenne qu'il lui
 * faut un autre code plutôt que de croire le sien cassé.
 */
export function AccessGate({ ability, matchId, onUnlock, onExit }: { ability: Ability; matchId: string; onUnlock: () => void; onExit: () => void }) {
  const nomAccès = NOM_ROLE[REQUIS[ability]]
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: C.frame, color: C.text }}>
      {/* Le cadenas se dessine au trait et prend la couleur du texte, comme les
          autres marques de l'application : l'émoji jaune de cinq rems posé ici
          était le seul objet en couleur d'un écran par ailleurs monochrome. */}
      <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: C.accentBg, color: C.accent }}>
        <Lock className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h2 className="text-2xl font-extrabold tracking-tight">Accès {nomAccès} requis</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Le code {nomAccès.toLowerCase()} est requis pour saisir la rencontre.</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button onClick={onUnlock} className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110">
          <LockOpen className="h-4 w-4" strokeWidth={2} />
          Déverrouiller
        </button>
        <Link to={`/match/${matchId}/watch`} className="flex items-center gap-2 rounded-xl border border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted">
          <Eye className="h-4 w-4" strokeWidth={2} />
          Suivi spectateur
        </Link>
      </div>
      <button onClick={onExit} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground">← Accueil</button>
    </div>
  )
}
