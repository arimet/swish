import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { listTeams } from '../../persistence/repositories'
import type { Team } from '../../domain/types'
import { C, bd, Ic, ICON, TeamBadge } from './kit'
import { useAdmin } from '../../app/admin'
import { useClub } from '../../app/club'

const NAV_CLUB = [
  { icon: ICON.trophy, label: 'Tableau de bord', to: '/', end: true },
]
const NAV_CHAMP = [
  { icon: ICON.cal, label: 'Calendrier', to: '/calendrier', end: false },
  { icon: ICON.users, label: 'Équipes', to: '/teams', end: false },
]
const NAV_MOBILE = [
  { icon: ICON.trophy, label: 'Tableau de bord', to: '/', end: true },
  { icon: ICON.cal, label: 'Calendrier', to: '/calendrier', end: false },
  { icon: ICON.users, label: 'Équipes', to: '/teams', end: false },
]
const TITLES: Record<string, string> = {
  '/': 'Tableau de bord', '/calendrier': 'Calendrier',
  '/teams': 'Équipes', '/match/new': 'Nouvelle rencontre',
}

export function OliveShell() {
  const { pathname } = useLocation()
  const { isAdmin, lock, guard } = useAdmin()
  const title = TITLES[pathname] ?? (pathname.startsWith('/teams') ? 'Équipes' : pathname.startsWith('/match') ? 'Rencontre' : 'Rencontres')
  return (
    <div className="min-h-dvh lg:p-4" style={{ background: C.page }}>
      <div className="mx-auto flex h-dvh w-full max-w-[1680px] overflow-hidden lg:h-[calc(100dvh-2rem)] lg:rounded-[26px] lg:shadow-2xl" style={{ background: C.frame, color: C.text }}>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6 sm:py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 text-base font-extrabold sm:text-lg"><span>🏀</span><span style={{ color: C.orange }}>{title}</span></div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => (isAdmin ? lock() : guard(() => {}))}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm lg:hidden"
                style={{ background: C.card, border: bd, color: isAdmin ? C.green : C.muted }}
                title={isAdmin ? 'Admin déverrouillé' : 'Accès admin'}
              >{isAdmin ? '🔓' : '🔒'}</button>
              <Link to="/match/new" className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white sm:px-4" style={{ background: C.orange }}>
                <Ic d={ICON.plus} className="h-4 w-4" /> <span className="hidden sm:inline">Nouvelle rencontre</span>
              </Link>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
          <MobileNav />
        </div>
      </div>
    </div>
  )
}

/** Barre de navigation basse (mobile) : le menu latéral étant masqué < lg.
 *  Quatre entrées maximum — au-delà, les cibles deviennent trop étroites au pouce. */
function MobileNav() {
  return (
    <nav className="flex shrink-0 items-stretch justify-around gap-1 border-t px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden" style={{ borderColor: C.border, background: C.panel }}>
      {NAV_MOBILE.map((n) => (
        <NavLink key={n.label} to={n.to} end={n.end}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold transition"
          style={({ isActive }) => ({ color: isActive ? C.orange : C.muted, background: isActive ? C.card2 : 'transparent' })}>
          <Ic d={n.icon} className="h-5 w-5" />
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Liens d'un groupe de menu, factorisé entre « Mon club » et « Championnat ». */
function NavGroup({ items }: { items: { icon: string; label: string; to: string; end: boolean }[] }) {
  return (
    <nav className="mt-1.5 flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink key={n.label} to={n.to} end={n.end}
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: isActive ? C.card2 : 'transparent', color: isActive ? C.orange : C.muted })}>
          {({ isActive }) => (<>{isActive && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.orange }} />}<Ic d={n.icon} />{n.label}</>)}
        </NavLink>
      ))}
    </nav>
  )
}

function Sidebar() {
  const { isAdmin, lock, guard } = useAdmin()
  const { clubId, clear } = useClub()
  const [teams, setTeams] = useState<Team[]>([])
  useEffect(() => { listTeams().then(setTeams) }, [])
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col overflow-y-auto px-4 py-5 lg:flex" style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}>
      <Link to="/" className="flex items-center gap-2.5 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: C.orange }}>🏀</span>
        <span className="leading-none">
          <span className="block text-[15px] font-extrabold tracking-tight">Swish</span>
          <span className="block text-[11px]" style={{ color: C.faint }}>Basket · table de marque</span>
        </span>
      </Link>

      <p className="mt-6 px-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>Mon club</p>
      <NavGroup items={NAV_CLUB} />
      {clubId && (
        <NavLink to={`/teams/${clubId}`} end
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: isActive ? C.card2 : 'transparent', color: isActive ? C.orange : C.muted })}>
          {({ isActive }) => (<>{isActive && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.orange }} />}<Ic d={ICON.users} />Mon équipe</>)}
        </NavLink>
      )}

      <p className="mt-6 px-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>Championnat</p>
      <NavGroup items={NAV_CHAMP} />

      <p className="mt-6 px-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>Équipes</p>
      <ul className="mt-1.5 space-y-0.5">
        {teams.map((t) => (
          <li key={t.id}>
            <Link to={`/teams/${t.id}`} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition hover:bg-white/5" style={{ color: C.muted }}>
              <TeamBadge id={t.id} name={t.name} size="h-6 w-6 text-[9px]" /><span className="truncate">{t.name}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2.5">
        <button
          onClick={clear}
          className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition"
          style={{ background: C.card, border: bd, color: C.muted }}
          title="Revenir à l’écran de bienvenue pour suivre un autre club"
        >
          <span>🔁</span>
          Changer de club
        </button>
        <button
          onClick={() => (isAdmin ? lock() : guard(() => {}))}
          className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition"
          style={{ background: C.card, border: bd, color: isAdmin ? C.green : C.muted }}
          title={isAdmin ? 'Verrouiller l’accès admin' : 'Déverrouiller l’accès admin'}
        >
          <span>{isAdmin ? '🔓' : '🔒'}</span>
          {isAdmin ? 'Admin déverrouillé' : 'Accès admin'}
        </button>
        <a href="https://github.com/arimet" target="_blank" rel="noopener noreferrer"
          className="block px-2 text-center text-[11px] font-medium transition hover:underline" style={{ color: C.faint }}>
          Fait par Anthony Rimet ↗
        </a>
      </div>
    </aside>
  )
}
