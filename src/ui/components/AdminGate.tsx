import { Link } from 'react-router-dom'

/**
 * Écran de verrouillage de la table de marque : la saisie du match est
 * réservée à l'admin, les spectateurs passent par /watch (lecture seule).
 */
export function AdminGate({ matchId, onUnlock, onExit }: { matchId: string; onUnlock: () => void; onExit: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-5xl">🔒</div>
      <h2 className="text-xl font-extrabold tracking-tight">Accès table de marque</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Le mot de passe administrateur est requis pour saisir la rencontre.</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button onClick={onUnlock} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110">
          🔓 Déverrouiller
        </button>
        <Link to={`/match/${matchId}/watch`} className="rounded-xl border border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted">
          👁 Suivi spectateur
        </Link>
      </div>
      <button onClick={onExit} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground">← Accueil</button>
    </div>
  )
}
