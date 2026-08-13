import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listPlayers } from '../../persistence/repositories'
import type { Player } from '../../domain/types'
import { C, bd, Ic, ICON, Vous } from './kit'
import { NOM_ROLE, useAuth } from '../../app/auth'
import { useClub } from '../../app/club'

// « Mon équipe » s'intercale entre les deux : lien à part car sa cible dépend
// du club suivi (`/teams/<clubId>`), rendu seulement quand un club est réglé.
const NAV_TOP = [
  { icon: ICON.trophy, label: 'Tableau de bord', to: '/', end: true },
]
const NAV_REST = [
  { icon: ICON.cal, label: 'Calendrier', to: '/calendrier', end: false },
  { icon: ICON.trophy, label: 'Championnat', to: '/championnat', end: false },
  { icon: ICON.users, label: 'Équipes', to: '/teams', end: false },
  { icon: ICON.matches, label: 'Schémas', to: '/schemas', end: false },
]
const NAV_MOBILE = [
  { icon: ICON.trophy, label: 'Tableau de bord', to: '/', end: true },
  { icon: ICON.cal, label: 'Calendrier', to: '/calendrier', end: false },
  { icon: ICON.users, label: 'Équipes', to: '/teams', end: false },
]
// « Mon équipe » cible `/teams/<clubId>` : sans club réglé, ce serait un lien
// vers `/teams/undefined` — l'entrée n'est ajoutée qu'une fois le club connu.
const TITLES: Record<string, string> = {
  '/': 'Tableau de bord', '/calendrier': 'Calendrier', '/championnat': 'Championnat',
  '/teams': 'Équipes', '/schemas': 'Schémas', '/match/new': 'Nouvelle rencontre',
}

export function OliveShell() {
  const { pathname } = useLocation()
  const { clubId } = useClub()
  const { playerId, setPlayer } = useAuth()
  // `null` tant que l'effectif n'est pas chargé : sans cette distinction, le
  // garde ci-dessous prendrait le tableau vide du premier rendu pour un effectif
  // réel et effacerait l'identité à chaque ouverture.
  const [players, setPlayers] = useState<Player[] | null>(null)
  // La branche sans club est inatteignable tant que `ClubGate` ne monte cette
  // coquille qu'avec un club résolu ; la garder revient à dire « effectif vide »,
  // ce qui effacerait l'identité si l'on montait un jour ce composant sans club.
  useEffect(() => { if (clubId) listPlayers(clubId).then(setPlayers); else setPlayers([]) }, [clubId])

  // Joueur retiré de l'effectif alors que son identifiant survit dans le
  // localStorage : on oublie l'identité plutôt que de laisser une mise en
  // évidence fantôme, comme `ClubProvider` oublie un club supprimé.
  useEffect(() => {
    if (players && playerId && !players.some((p) => p.id === playerId)) setPlayer(null)
  }, [players, playerId, setPlayer])

  const effectif = players ?? []
  const title = TITLES[pathname] ?? (pathname.startsWith('/teams') ? 'Équipes' : pathname.startsWith('/schemas') ? 'Schémas' : pathname.startsWith('/match') ? 'Rencontre' : 'Rencontres')
  return (
    <div className="min-h-dvh lg:p-4" style={{ background: C.page }}>
      <div className="mx-auto flex h-dvh w-full max-w-[1680px] overflow-hidden lg:h-[calc(100dvh-2rem)] lg:rounded-[26px] lg:shadow-2xl" style={{ background: C.frame, color: C.text }}>
        <Sidebar players={effectif} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6 sm:py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 text-base font-extrabold sm:text-lg"><span>🏀</span><span style={{ color: C.orange }}>{title}</span></div>
            {/* L'en-tête ne garde que le titre et le menu d'accès. « Nouvelle
                rencontre » est parti au calendrier, où vivent les choses datées. */}
            <div className="ml-auto flex items-center gap-2">
              <AccesMenu players={effectif} compact />
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

/** Point d'entrée unique des accès. Il dit le rôle en cours, en prend un autre à
 *  partir d'un code, verrouille, et — quand le code saisi est celui du joueur —
 *  laisse choisir son nom dans l'effectif.
 *
 *  Une seule saisie pour tous les codes : l'utilisateur tape ce qu'il a, il ne
 *  déclare pas d'abord ce qu'il veut être. Et l'identité de joueur n'est pas un
 *  quatrième rôle — la choisir n'accorde aucun droit d'écriture, la perdre n'en
 *  retire aucun.
 *
 *  Le même composant sert à l'en-tête mobile (`compact`) et à la barre latérale :
 *  deux copies finiraient par diverger. */
function AccesMenu({ players, compact = false }: { players: Player[]; compact?: boolean }) {
  const { role, playerId, unlock, lock, setPlayer } = useAuth()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [choix, setChoix] = useState(false)
  const moi = players.find((p) => p.id === playerId) ?? null
  const verrouille = role === 'visiteur'

  const ouvrir = () => { setCode(''); setErreur(''); setChoix(false); setOpen(true) }
  const valider = () => {
    const obtenu = unlock(code)
    setCode('')
    if (!obtenu) { setErreur('Code inconnu.'); return }
    setErreur('')
    // Seul le code joueur ouvre le choix du nom ; les autres changent le rôle,
    // que le dialogue affiche aussitôt en guise de confirmation.
    setChoix(obtenu === 'joueur')
  }

  return (
    <>
      <button
        onClick={ouvrir}
        aria-label={`Accès · ${NOM_ROLE[role]}`}
        title={`Accès · ${NOM_ROLE[role]}`}
        className={compact
          ? 'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm lg:hidden'
          : 'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition'}
        style={{ background: C.card, border: bd, color: verrouille ? C.muted : C.green }}
      >
        <span>{verrouille ? '🔒' : '🔓'}</span>
        {!compact && <span className="truncate">Accès · {NOM_ROLE[role]}</span>}
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-xs border-none bg-[#161618] p-5 text-white [&>button]:text-white/60">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Accès</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] font-semibold">Accès en cours : {NOM_ROLE[role]}</p>
          <p className="text-[13px]" style={{ color: '#8a8a90' }}>
            {moi ? `Identifié comme ${moi.lastName} ${moi.firstName}.` : 'Aucun joueur identifié sur cet appareil.'}
          </p>

          {choix ? (
            <>
              <p className="text-[13px] font-semibold">Qui êtes-vous dans l’effectif ?</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {[...players].sort((a, b) => a.number - b.number).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => { setPlayer(p.id); setChoix(false); setOpen(false) }}
                      className="flex w-full items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-2 text-left text-sm font-medium transition hover:bg-white/10"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[9px] font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                      <span className="truncate">{p.lastName} {p.firstName}</span>
                    </button>
                  </li>
                ))}
                {players.length === 0 && <li className="py-2 text-[13px]" style={{ color: '#8a8a90' }}>Aucun joueur dans l’effectif.</li>}
              </ul>
            </>
          ) : (
            <>
              <input
                autoFocus aria-label="Code d’accès" type="password" value={code} placeholder="Code"
                onChange={(e) => { setCode(e.target.value); setErreur('') }}
                onKeyDown={(e) => e.key === 'Enter' && valider()}
                className={`w-full rounded-xl border bg-[#202024] px-4 py-3 text-sm outline-none transition ${erreur ? 'border-red-500/60' : 'border-white/10 focus:border-[#ff4d6d]'}`}
              />
              {erreur && <p className="text-xs font-semibold text-red-400">{erreur}</p>}
              <button onClick={valider} className="rounded-xl bg-[#ff4d6d] py-2.5 text-sm font-bold text-white transition hover:brightness-110">Déverrouiller</button>
            </>
          )}

          <div className="flex gap-2">
            {moi && !choix && (
              <button onClick={() => setPlayer(null)} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-bold transition hover:bg-white/20">Ne plus m’identifier</button>
            )}
            {!verrouille && (
              <button onClick={lock} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-bold transition hover:bg-white/20">Se verrouiller</button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Barre de navigation basse (mobile) : le menu latéral étant masqué < lg.
 *  Quatre entrées maximum — au-delà, les cibles deviennent trop étroites au pouce. */
function MobileNav() {
  const { clubId } = useClub()
  const items = clubId
    ? [...NAV_MOBILE, { icon: ICON.users, label: 'Mon équipe', to: `/teams/${clubId}`, end: true }]
    : NAV_MOBILE
  return (
    <nav className="flex shrink-0 items-stretch justify-around gap-1 border-t px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden" style={{ borderColor: C.border, background: C.panel }}>
      {items.map((n) => (
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

/** Liens d'un groupe de menu de la barre latérale. */
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

function Sidebar({ players }: { players: Player[] }) {
  const { playerId } = useAuth()
  const { clubId, clear } = useClub()
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
      <NavGroup items={NAV_TOP} />
      {clubId && (
        <NavLink to={`/teams/${clubId}`} end
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: isActive ? C.card2 : 'transparent', color: isActive ? C.orange : C.muted })}>
          {({ isActive }) => (<>{isActive && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.orange }} />}<Ic d={ICON.users} />Mon équipe</>)}
        </NavLink>
      )}
      <NavGroup items={NAV_REST} />

      {clubId && players.length > 0 && (
        <>
          <p className="mt-6 px-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>Effectif</p>
          <ul className="mt-1.5 space-y-0.5">
            {[...players].sort((a, b) => a.number - b.number).map((p) => {
              const estMoi = p.id === playerId
              return (
                <li key={p.id}>
                  <Link to={`/players/${p.id}`} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition hover:bg-white/5" style={{ color: estMoi ? C.text : C.muted }}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[9px] font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                    <span className="truncate">{p.firstName} {p.lastName}</span>
                    {estMoi && <Vous />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}

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
        <AccesMenu players={players} />
        <a href="https://github.com/arimet" target="_blank" rel="noopener noreferrer"
          className="block px-2 text-center text-[11px] font-medium transition hover:underline" style={{ color: C.faint }}>
          Fait par Anthony Rimet ↗
        </a>
      </div>
    </aside>
  )
}
