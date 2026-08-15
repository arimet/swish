import { Link } from 'react-router-dom'
import { useClub } from '../../app/club'
import { C, bd, Ic, ICON, TeamBadge } from '../olive/kit'

/** Premier lancement : choisir le club suivi. Affiché à la place du shell tant
 *  qu'aucun club valide n'est réglé — ce n'est pas une route dont on s'échappe.
 *
 *  Posé sur le **cadre** et non sur la page : la page est la gouttière derrière
 *  le cadre arrondi, le plan le plus foncé du thème clair, et personne n'y écrit
 *  jamais. Cet écran, lui, est du contenu — le texte secondaire y tombait à
 *  4,2:1, il tient 5,3:1 sur le cadre. */
export function Welcome() {
  const { teams, ready, setClub } = useClub()
  // Tant que la liste des équipes n'est pas arrivée, on ne sait pas si le club
  // est vide : éviter d'afficher un instant « aucune équipe » à tort.
  if (!ready) return <div className="grid min-h-dvh place-items-center" style={{ background: C.frame, color: C.muted }}>Chargement…</div>
  return (
    <div className="grid min-h-dvh place-items-center p-6" style={{ background: C.frame, color: C.text }}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: C.brand, color: C.onBrand }}><Ic d={ICON.ball} className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Bienvenue sur Swish</h1>
            <p className="text-sm" style={{ color: C.muted }}>Quel club suivez-vous ?</p>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ border: `1px dashed ${C.border}` }}>
            <p className="text-sm" style={{ color: C.muted }}>Aucune équipe enregistrée pour l’instant.</p>
            <Link to="/teams/new" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
              Créer ma première équipe →
            </Link>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {teams.map((t) => (
              <li key={t.id}>
                <button onClick={() => setClub(t.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:brightness-125"
                  style={{ background: C.card, border: bd }}>
                  <TeamBadge id={t.id} name={t.name} size="h-9 w-9 text-[12px]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.name}</span>
                  <span style={{ color: C.faint }}>→</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 text-center text-[12px]" style={{ color: C.faint }}>
          Ce choix se modifie ensuite depuis le menu.
        </p>
      </div>
    </div>
  )
}
