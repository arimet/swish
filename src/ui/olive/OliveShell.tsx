import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Eraser, Lock, LockOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listPlayers } from '../../persistence/repositories'
import type { Player } from '../../domain/types'
import { C, bd, Ic, ICON } from './kit'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { LangSwitcher } from '../../i18n/LangSwitcher'
import { useT } from '../../i18n'
import { SyncState } from '../components/SyncState'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'

// "My team" slots in between the two: a separate link, because its target depends
// on the club being followed (`/teams/<clubId>`), rendered only once a club is set.
/* The labels are **keys** and not text: these arrays live at module level, where `t`
   does not exist yet. Translation happens at render time, in `NavGroup` and
   `MobileNav`. The catalogue test recognises them by their shape. */
const NAV_TOP = [
  { icon: ICON.trophy, label: 'nav.dashboard', to: '/', end: true },
]
const NAV_REST = [
  { icon: ICON.cal, label: 'nav.calendar', to: '/calendrier', end: false },
  { icon: ICON.trophy, label: 'nav.standings', to: '/championnat', end: false },
  { icon: ICON.users, label: 'nav.teams', to: '/teams', end: false },
  { icon: ICON.matches, label: 'nav.plays', to: '/schemas', end: false },
]
/* The bottom bar holds four entries, and the plays are one of them: the play viewer
   is made for the time-out, hence for a phone — it was the one screen of the
   application you could not reach from a phone. "My team" replaces "Teams" there once
   the club is set: in a one-team application it is the record you open, and the list
   stays one link away. */
const NAV_MOBILE = [
  /* "Home" and not "Dashboard": the long label wrapped onto two lines in a 94px slot
     and pushed its entry half a line below the other three. The sidebar has the room
     and keeps the full name. */
  { icon: ICON.trophy, label: 'nav.home', to: '/', end: true },
  { icon: ICON.cal, label: 'nav.calendar', to: '/calendrier', end: false },
  { icon: ICON.matches, label: 'nav.plays', to: '/schemas', end: false },
]
// "My team" targets `/teams/<clubId>`: without a club set it would be a link to
// `/teams/undefined` — the entry is only added once the club is known.
const TITLES: Record<string, string> = {
  '/': 'nav.dashboard', '/calendrier': 'nav.calendar', '/championnat': 'nav.standings',
  '/teams': 'nav.teams', '/schemas': 'nav.plays', '/match/new': 'nav.newGame',
  '/admin': 'nav.administration',
}

export function OliveShell() {
  const { pathname } = useLocation()
  const { clubId } = useClub()
  const { playerId, setPlayer } = useAuth()
  // `null` until the roster is loaded: without that distinction, the guard below
  // would take the first render's empty array for a real roster and erase the
  // identity at every opening.
  const [players, setPlayers] = useState<Player[] | null>(null)
  // The no-club branch is unreachable as long as `ClubGate` only mounts this shell
  // with a resolved club; keeping it amounts to saying "empty roster", which would
  // erase the identity if this component were ever mounted without a club.
  useEffect(() => { if (clubId) listPlayers(clubId).then(setPlayers); else setPlayers([]) }, [clubId])

  // Player removed from the roster while their id survives in localStorage: we
  // forget the identity rather than leave a ghost highlight, the way `ClubProvider`
  // forgets a deleted club.
  useEffect(() => {
    if (players && playerId && !players.some((p) => p.id === playerId)) setPlayer(null)
  }, [players, playerId, setPlayer])

  const roster = players ?? []
  const translate = useT()
  const titleKey = TITLES[pathname] ?? (pathname.startsWith('/teams') ? 'nav.teams' : pathname.startsWith('/schemas') ? 'nav.plays' : pathname.startsWith('/match') ? 'nav.game' : 'nav.games')
  const title = translate(titleKey)
  return (
    <div className="min-h-dvh lg:p-4" style={{ background: C.page }}>
      <div className="mx-auto flex h-dvh w-full max-w-[1680px] overflow-hidden lg:h-[calc(100dvh-2rem)] lg:rounded-[26px] lg:shadow-2xl" style={{ background: C.frame, color: C.text }}>
        <Sidebar players={roster} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The page title, in ink and not in accent: it is the screen's steadiest
              landmark, it has nothing to highlight. The accent coloured every title,
              so it no longer signalled anything — a brand colour must stay rare to
              stay legible. And the ball that preceded it was the same on all eight
              pages: a repeated decoration does not inform. It holds its place as a
              mark in the sidebar, once. */}
          <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6 sm:py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            {/* Not an `<h1>`: every screen already has its own, naming *its* subject
                ("Avenir de Vignot", "New game"). This one only says where you are,
                like a breadcrumb, and two top-level headings per page would only
                mislead a reading aloud. It carries the role of the landmark, not the
                rank of the heading. */}
            <p className="truncate text-lg font-extrabold tracking-tight sm:text-xl">{title}</p>
            {/* The header keeps only the title, the theme and the access menu. "New
                game" moved to the calendar, where dated things live. */}
            <div className="ml-auto flex items-center gap-2">
              {/* Before the language and the theme: it is the only one of these three
                  that appears in order to say something, and it must not shift the
                  other two as it appears. */}
              <SyncState compact />
              <LangSwitcher />
              <ThemeSwitcher />
              <AccessMenu players={roster} compact />
            </div>
          </header>
          {/* `relative` is not decorative: the screens' `sr-only` labels are absolutely
              positioned and, without a positioned ancestor, anchor to the document
              instead of their row. They then escaped the shell's clipping and
              lengthened the whole page — hence a second scrollbar, on top of this
              area's own. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
          <MobileNav />
        </div>
      </div>
    </div>
  )
}

/** The single entry point for access. It states the current role, takes another one
 *  from a code, locks, and — when the code entered is the player's — lets you pick
 *  your name from the roster.
 *
 *  One input for every code: the user types what they have, they do not first
 *  declare what they want to be. And the player identity is not a fourth role —
 *  choosing it grants no write right, losing it removes none.
 *
 *  The same component serves the mobile header (`compact`) and the sidebar: two
 *  copies would end up diverging. */
function AccessMenu({ players, compact = false }: { players: Player[]; compact?: boolean }) {
  const translate = useT()
  const { role, playerId, unlock, lock, setPlayer } = useAuth()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const me = players.find((p) => p.id === playerId) ?? null
  const locked = role === 'visitor'

  const open_ = () => { setCode(''); setError(''); setPicking(false); setOpen(true) }
  const submit = () => {
    const obtained = unlock(code)
    setCode('')
    if (!obtained) { setError(translate('access.unknownCode')); return }
    setError('')
    // Only the player code opens the name picker; the others change the role, which
    // the dialog shows straight away as confirmation.
    setPicking(obtained === 'player')
  }

  return (
    <>
      <button
        onClick={open_}
        aria-label={`${translate('access.title')} · ${translate(`role.${role}`)}`}
        title={`${translate('access.title')} · ${translate(`role.${role}`)}`}
        className={compact
          ? 'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm lg:hidden'
          : 'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition'}
        style={{ background: C.card, border: bd, color: locked ? C.muted : C.green }}
      >
        {/* A drawn glyph, not a coloured padlock: the emoji ignored the tint set just
            above, so it stayed yellow while the state said "green, unlocked" — and it
            changed shape from one operating system to the next. */}
        {locked ? <Lock className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /> : <LockOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />}
        {!compact && <span className="truncate">{translate('access.title')} · {translate(`role.${role}`)}</span>}
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-xs border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">{translate('access.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] font-semibold">{translate('access.current', { role: translate(`role.${role}`) })}</p>
          <p className="text-[13px]" style={{ color: C.muted }}>
            {me ? translate('access.identifiedAs', { name: `${me.lastName} ${me.firstName}` }) : translate('access.noIdentity')}
          </p>

          {picking ? (
            <>
              <p className="text-[13px] font-semibold">{translate('access.whoAreYou')}</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {[...players].sort((a, b) => a.number - b.number).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => { setPlayer(p.id); setPicking(false); setOpen(false) }}
                      className="flex w-full items-center gap-2.5 rounded-xl bg-[var(--c-card2)] px-2.5 py-2 text-left text-sm font-medium transition hover:bg-[var(--c-card2)]"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                      <span className="truncate">{p.lastName} {p.firstName}</span>
                    </button>
                  </li>
                ))}
                {players.length === 0 && <li className="py-2 text-[13px]" style={{ color: C.muted }}>{translate('access.emptyRoster')}</li>}
              </ul>
            </>
          ) : (
            <>
              <input
                autoFocus aria-label={translate('access.codeLabel')} type="password" value={code} placeholder={translate('access.codePlaceholder')}
                onChange={(e) => { setCode(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className={`w-full rounded-xl border bg-[var(--c-card2)] px-4 py-3 text-sm outline-none transition ${error ? 'border-[var(--c-danger)]' : 'border-[var(--c-border)] focus:border-[var(--c-accent)]'}`}
              />
              {error && <p className="text-xs font-semibold text-[var(--c-danger)]">{error}</p>}
              <button onClick={submit} className="rounded-xl bg-[var(--c-brand)] py-2.5 text-sm font-bold text-[var(--c-on-brand)] transition hover:brightness-110">{translate('access.unlock')}</button>
            </>
          )}

          <div className="flex gap-2">
            {me && !picking && (
              <button onClick={() => setPlayer(null)} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{translate('access.forgetMe')}</button>
            )}
            {!locked && (
              <button onClick={lock} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{translate('access.lock')}</button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The bottom navigation bar (mobile): the sidebar is hidden below `lg`. Four
 *  entries maximum — beyond that, the targets get too narrow for a thumb. */
function MobileNav() {
  const translate = useT()
  const { clubId } = useClub()
  const items = clubId
    ? [...NAV_MOBILE, { icon: ICON.users, label: 'nav.myTeam', to: `/teams/${clubId}`, end: true }]
    : [...NAV_MOBILE, { icon: ICON.users, label: 'nav.teams', to: '/teams', end: false }]
  return (
    <nav className="flex shrink-0 items-stretch justify-around gap-1 border-t px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden" style={{ borderColor: C.border, background: C.panel }}>
      {items.map((n) => (
        <NavLink key={n.label} to={n.to} end={n.end}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[12px] font-bold transition"
          style={({ isActive }) => ({ color: isActive ? C.accent : C.muted, background: isActive ? C.card2 : 'transparent' })}>
          <Ic d={n.icon} className="h-5 w-5" />
          {translate(n.label)}
        </NavLink>
      ))}
    </nav>
  )
}

/** The links of one sidebar menu group. */
function NavGroup({ items, mutedOn }: { items: { icon: string; label: string; to: string; end: boolean }[]; mutedOn?: string }) {
  const translate = useT()
  const { pathname } = useLocation()
  /** "Teams" used to light up on my team's record, which sits under `/teams/`: two
   *  menu entries would have lit for a single page. The entry that owns the route
   *  keeps it; the one that merely prefixes it goes dark. */
  const active = (isActive: boolean, to: string) =>
    isActive && !(mutedOn && mutedOn !== to && pathname === mutedOn)
  return (
    <nav className="mt-1.5 flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink key={n.label} to={n.to} end={n.end}
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: active(isActive, n.to) ? C.card2 : 'transparent', color: active(isActive, n.to) ? C.accent : C.muted })}>
          {({ isActive }) => (<>{active(isActive, n.to) && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.brand }} />}<Ic d={n.icon} />{translate(n.label)}</>)}
        </NavLink>
      ))}
    </nav>
  )
}

function Sidebar({ players }: { players: Player[] }) {
  const translate = useT()
  const { clubId } = useClub()
  const { can } = useAuth()
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col overflow-y-auto px-4 py-5 lg:flex" style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}>
      {/* The name alone: the subtitle described the application to someone who had
          already opened it, and had said nothing accurate since it grew to do far
          more than a scorer's table. */}
      <Link to="/" className="flex items-center gap-2.5 px-1">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: C.brand, color: C.onBrand }}>
          <Ic d={ICON.ball} className="h-5 w-5" />
        </span>
        <span className="text-lg font-extrabold leading-none tracking-tight">Swish</span>
      </Link>

      <p className="mt-6 px-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>{translate('nav.myClub')}</p>
      <NavGroup items={NAV_TOP} />
      {clubId && (
        <NavLink to={`/teams/${clubId}`} end
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: isActive ? C.card2 : 'transparent', color: isActive ? C.accent : C.muted })}>
          {({ isActive }) => (<>{isActive && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.brand }} />}<Ic d={ICON.users} />{translate('nav.myTeam')}</>)}
        </NavLink>
      )}
      <NavGroup items={NAV_REST} mutedOn={clubId ? `/teams/${clubId}` : undefined} />

      {/* The roster is no longer in the menu: thirteen names pushed the navigation off
          screen and made the bar scroll. It belongs on the team record, which is where
          you go to consult it. The identified player is still recognisable on the
          dashboard and on their own record. */}

      {/* No more "change club": the application is one team's, not a directory you
          browse. The club is set once, at first launch, and is only re-picked if it
          disappears. */}
      <div className="mt-auto space-y-2.5">
        <AccessMenu players={players} />
        {/* Data cleanup, under access and only for the administrator: a visitor has no
            business seeing a door they cannot open. The entry appears as soon as the
            admin code is entered, in the dialog just above. */}
        {can('manage') && (
          <NavLink to="/admin"
            className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition"
            style={({ isActive }) => ({ background: C.card, border: bd, color: isActive ? C.accent : C.muted })}>
            <Eraser className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
            {translate('nav.administration')}
          </NavLink>
        )}
        <a href="https://github.com/arimet" target="_blank" rel="noopener noreferrer"
          className="block px-2 py-1.5 text-center text-[12px] font-medium transition hover:underline" style={{ color: C.faint }}>
          {translate('nav.credit')}
        </a>
      </div>
    </aside>
  )
}
