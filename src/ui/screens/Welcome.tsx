import { Link } from 'react-router-dom'
import { useClub } from '../../app/club'
import { C, bd, Ic, ICON, TeamBadge } from '../olive/kit'
import { useT } from '../../i18n'

/** First launch: pick the club to follow. Shown in place of the shell as long as
 *  no valid club is set — it is not a route you escape from.
 *
 *  Laid on the **frame** and not on the page: the page is the gutter behind the
 *  rounded frame, the light theme's darkest plane, and nobody ever writes there.
 *  This screen is content — its secondary text fell to 4.2:1 there, it holds 5.3:1
 *  on the frame. */
export function Welcome() {
  const translate = useT()
  const { teams, ready, setClub } = useClub()
  // Until the team list has arrived we do not know whether the club is empty:
  // avoid flashing "no team" for a moment when it is not true.
  if (!ready) return <div className="grid min-h-dvh place-items-center" style={{ background: C.frame, color: C.muted }}>{translate('commun.chargement')}</div>
  return (
    <div className="grid min-h-dvh place-items-center p-6" style={{ background: C.frame, color: C.text }}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: C.brand, color: C.onBrand }}><Ic d={ICON.ball} className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{translate('bienvenue.titre')}</h1>
            <p className="text-sm" style={{ color: C.muted }}>{translate('bienvenue.question')}</p>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ border: `1px dashed ${C.border}` }}>
            <p className="text-sm" style={{ color: C.muted }}>{translate('bienvenue.aucuneEquipe')}</p>
            <Link to="/teams/new" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
              {translate('bienvenue.premiereEquipe')}
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
          {translate('bienvenue.modifiable')}
        </p>
      </div>
    </div>
  )
}
