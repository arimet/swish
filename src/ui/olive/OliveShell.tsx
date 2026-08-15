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
import { SyncState } from '../components/EtatSynchro'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'

// « Mon équipe » s'intercale entre les deux : lien à part car sa cible dépend
// du club suivi (`/teams/<clubId>`), rendu seulement quand un club est réglé.
/* Les libellés sont des **clefs** et non du texte : ces tableaux vivent au niveau du
   module, où `t` n'existe pas encore. La traduction se fait au rendu, dans `NavGroup`
   et `MobileNav`. Le test du catalogue les reconnaît à leur forme. */
const NAV_TOP = [
  { icon: ICON.trophy, label: 'nav.tableauDeBord', to: '/', end: true },
]
const NAV_REST = [
  { icon: ICON.cal, label: 'nav.calendrier', to: '/calendrier', end: false },
  { icon: ICON.trophy, label: 'nav.championnat', to: '/championnat', end: false },
  { icon: ICON.users, label: 'nav.equipes', to: '/teams', end: false },
  { icon: ICON.matches, label: 'nav.schemas', to: '/schemas', end: false },
]
/* La barre basse tient quatre entrées, et les schémas en font partie : le lecteur de
   combinaisons est fait pour le temps-mort, donc pour un téléphone — c'était le seul
   écran de l'application qu'on ne pouvait pas atteindre depuis un téléphone.
   « Mon équipe » y remplace « Équipes » quand le club est réglé : dans une application
   d'une seule équipe, c'est la fiche qu'on ouvre, et la liste reste à un lien de là. */
const NAV_MOBILE = [
  /* « Accueil » et non « Tableau de bord » : le libellé long passait sur deux lignes
     dans une case de 94 px et faisait dépasser son entrée d'une demi-ligne sous les
     trois autres. La barre latérale, elle, a la place et garde le nom complet. */
  { icon: ICON.trophy, label: 'nav.accueil', to: '/', end: true },
  { icon: ICON.cal, label: 'nav.calendrier', to: '/calendrier', end: false },
  { icon: ICON.matches, label: 'nav.schemas', to: '/schemas', end: false },
]
// « Mon équipe » cible `/teams/<clubId>` : sans club réglé, ce serait un lien
// vers `/teams/undefined` — l'entrée n'est ajoutée qu'une fois le club connu.
const TITLES: Record<string, string> = {
  '/': 'nav.tableauDeBord', '/calendrier': 'nav.calendrier', '/championnat': 'nav.championnat',
  '/teams': 'nav.equipes', '/schemas': 'nav.schemas', '/match/new': 'nav.nouvelleRencontre',
  '/admin': 'nav.administration',
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

  const roster = players ?? []
  const translate = useT()
  const clefTitre = TITLES[pathname] ?? (pathname.startsWith('/teams') ? 'nav.equipes' : pathname.startsWith('/schemas') ? 'nav.schemas' : pathname.startsWith('/match') ? 'nav.rencontre' : 'nav.rencontres')
  const title = translate(clefTitre)
  return (
    <div className="min-h-dvh lg:p-4" style={{ background: C.page }}>
      <div className="mx-auto flex h-dvh w-full max-w-[1680px] overflow-hidden lg:h-[calc(100dvh-2rem)] lg:rounded-[26px] lg:shadow-2xl" style={{ background: C.frame, color: C.text }}>
        <Sidebar players={roster} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Le titre de la page, en encre et non en accent : c'est le repère le
              plus stable de l'écran, il n'a rien à mettre en avant. L'accent
              coloriait chaque titre, si bien qu'il ne signalait plus rien — la
              couleur de marque doit rester rare pour rester lisible. Et le ballon
              qui le précédait était le même sur les huit pages : une décoration
              répétée n'informe pas. Il tient sa place de marque dans la barre
              latérale, une fois. */}
          <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6 sm:py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            {/* Pas un `<h1>` : chaque écran a déjà le sien, qui nomme *sa* matière
                (« Avenir de Vignot », « Nouveau match »). Celui-ci ne dit que
                l'endroit où l'on se trouve, comme un fil d'Ariane, et deux titres
                de premier niveau par page ne feraient qu'égarer une lecture à voix
                haute. Il porte le rôle du repère, pas le rang du titre. */}
            <p className="truncate text-lg font-extrabold tracking-tight sm:text-xl">{title}</p>
            {/* L'en-tête ne garde que le titre, le thème et le menu d'accès.
                « Nouvelle rencontre » est parti au calendrier, où vivent les
                choses datées. */}
            <div className="ml-auto flex items-center gap-2">
              {/* Avant la langue et le thème : c'est le seul de ces trois éléments
                  qui apparaisse pour dire quelque chose, et il ne doit pas déplacer
                  les deux autres en apparaissant. */}
              <SyncState compact />
              <LangSwitcher />
              <ThemeSwitcher />
              <AccesMenu players={roster} compact />
            </div>
          </header>
          {/* `relative` n'est pas décoratif : les libellés `sr-only` des écrans sont
              en position absolue et, sans ancêtre positionné, se calent sur le
              document au lieu de leur ligne. Ils échappaient alors au découpage de
              la coquille et allongeaient la page entière — d'où un second
              défilement, par-dessus celui de cette zone. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
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
  const translate = useT()
  const { role, playerId, unlock, lock, setPlayer } = useAuth()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [choix, setChoix] = useState(false)
  const moi = players.find((p) => p.id === playerId) ?? null
  const verrouille = role === 'visitor'

  const ouvrir = () => { setCode(''); setErreur(''); setChoix(false); setOpen(true) }
  const valider = () => {
    const obtenu = unlock(code)
    setCode('')
    if (!obtenu) { setErreur(translate('acces.codeInconnu')); return }
    setErreur('')
    // Seul le code joueur ouvre le choix du nom ; les autres changent le rôle,
    // que le dialogue affiche aussitôt en guise de confirmation.
    setChoix(obtenu === 'player')
  }

  return (
    <>
      <button
        onClick={ouvrir}
        aria-label={`${translate('acces.titre')} · ${translate(`role.${role}`)}`}
        title={`${translate('acces.titre')} · ${translate(`role.${role}`)}`}
        className={compact
          ? 'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm lg:hidden'
          : 'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition'}
        style={{ background: C.card, border: bd, color: verrouille ? C.muted : C.green }}
      >
        {/* Un glyphe tracé, pas un cadenas en couleur : l'émoji ignorait la teinte
            posée juste au-dessus, donc il restait jaune quand l'état disait « vert,
            déverrouillé » — et il changeait de dessin d'un système à l'autre. */}
        {verrouille ? <Lock className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /> : <LockOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />}
        {!compact && <span className="truncate">{translate('acces.titre')} · {translate(`role.${role}`)}</span>}
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-xs border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">{translate('acces.titre')}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] font-semibold">{translate('acces.enCours', { role: translate(`role.${role}`) })}</p>
          <p className="text-[13px]" style={{ color: C.muted }}>
            {moi ? translate('acces.identifieComme', { nom: `${moi.lastName} ${moi.firstName}` }) : translate('acces.aucuneIdentite')}
          </p>

          {choix ? (
            <>
              <p className="text-[13px] font-semibold">{translate('acces.quiEtesVous')}</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {[...players].sort((a, b) => a.number - b.number).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => { setPlayer(p.id); setChoix(false); setOpen(false) }}
                      className="flex w-full items-center gap-2.5 rounded-xl bg-[var(--c-card2)] px-2.5 py-2 text-left text-sm font-medium transition hover:bg-[var(--c-card2)]"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                      <span className="truncate">{p.lastName} {p.firstName}</span>
                    </button>
                  </li>
                ))}
                {players.length === 0 && <li className="py-2 text-[13px]" style={{ color: C.muted }}>{translate('acces.effectifVide')}</li>}
              </ul>
            </>
          ) : (
            <>
              <input
                autoFocus aria-label={translate('acces.codeLabel')} type="password" value={code} placeholder={translate('acces.codePlaceholder')}
                onChange={(e) => { setCode(e.target.value); setErreur('') }}
                onKeyDown={(e) => e.key === 'Enter' && valider()}
                className={`w-full rounded-xl border bg-[var(--c-card2)] px-4 py-3 text-sm outline-none transition ${erreur ? 'border-[var(--c-danger)]' : 'border-[var(--c-border)] focus:border-[var(--c-accent)]'}`}
              />
              {erreur && <p className="text-xs font-semibold text-[var(--c-danger)]">{erreur}</p>}
              <button onClick={valider} className="rounded-xl bg-[var(--c-brand)] py-2.5 text-sm font-bold text-[var(--c-on-brand)] transition hover:brightness-110">{translate('acces.deverrouiller')}</button>
            </>
          )}

          <div className="flex gap-2">
            {moi && !choix && (
              <button onClick={() => setPlayer(null)} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{translate('acces.nePlusMIdentifier')}</button>
            )}
            {!verrouille && (
              <button onClick={lock} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{translate('acces.seVerrouiller')}</button>
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
  const translate = useT()
  const { clubId } = useClub()
  const items = clubId
    ? [...NAV_MOBILE, { icon: ICON.users, label: 'nav.monEquipe', to: `/teams/${clubId}`, end: true }]
    : [...NAV_MOBILE, { icon: ICON.users, label: 'nav.equipes', to: '/teams', end: false }]
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

/** Liens d'un groupe de menu de la barre latérale. */
function NavGroup({ items, inactifSur }: { items: { icon: string; label: string; to: string; end: boolean }[]; inactifSur?: string }) {
  const translate = useT()
  const { pathname } = useLocation()
  /** « Équipes » s'allumait sur la fiche de mon équipe, qui est sous `/teams/` :
   *  deux entrées du menu se seraient éclairées pour une seule page. L'entrée qui
   *  possède la route la garde ; celle qui ne fait que la préfixer s'éteint. */
  const actif = (isActive: boolean, to: string) =>
    isActive && !(inactifSur && inactifSur !== to && pathname === inactifSur)
  return (
    <nav className="mt-1.5 flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink key={n.label} to={n.to} end={n.end}
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: actif(isActive, n.to) ? C.card2 : 'transparent', color: actif(isActive, n.to) ? C.accent : C.muted })}>
          {({ isActive }) => (<>{actif(isActive, n.to) && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.brand }} />}<Ic d={n.icon} />{translate(n.label)}</>)}
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
      {/* Le nom seul : le sous-titre décrivait l'application à qui l'a déjà ouverte,
          et ne disait plus rien de juste depuis qu'elle fait bien plus qu'une
          table de marque. */}
      <Link to="/" className="flex items-center gap-2.5 px-1">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: C.brand, color: C.onBrand }}>
          <Ic d={ICON.ball} className="h-5 w-5" />
        </span>
        <span className="text-lg font-extrabold leading-none tracking-tight">Swish</span>
      </Link>

      <p className="mt-6 px-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>{translate('nav.monClub')}</p>
      <NavGroup items={NAV_TOP} />
      {clubId && (
        <NavLink to={`/teams/${clubId}`} end
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={({ isActive }) => ({ background: isActive ? C.card2 : 'transparent', color: isActive ? C.accent : C.muted })}>
          {({ isActive }) => (<>{isActive && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full" style={{ width: 3, background: C.brand }} />}<Ic d={ICON.users} />{translate('nav.monEquipe')}</>)}
        </NavLink>
      )}
      <NavGroup items={NAV_REST} inactifSur={clubId ? `/teams/${clubId}` : undefined} />

      {/* L'effectif n'est plus dans le menu : treize noms y poussaient la navigation
          hors de l'écran et faisaient défiler la barre. Il est à sa place sur la
          fiche d'équipe, où l'on va pour le consulter. Le joueur identifié se
          reconnaît toujours au tableau de bord et sur sa propre fiche. */}

      {/* Plus de « changer de club » : l'application est celle d'une équipe, pas
          un annuaire qu'on parcourt. Le club se règle une fois, au premier
          lancement, et ne se rechoisit que s'il disparaît. */}
      <div className="mt-auto space-y-2.5">
        <AccesMenu players={players} />
        {/* Le ménage des données, sous l'accès et seulement pour l'administrateur :
            un visiteur n'a pas à voir une porte qu'il ne peut pas ouvrir. L'entrée
            apparaît dès que le code admin est saisi, dans le dialogue juste au-dessus. */}
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
