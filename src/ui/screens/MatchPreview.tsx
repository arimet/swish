import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getMatch, listTeams, deleteMatch, listPlayers, getConvocation, saveConvocation } from '../../persistence/repositories'
import type { Match, Team, Player } from '../../domain/types'
import { C, bd, PageTitle, SectionTitle, TeamBadge, fmtDate, champLabel } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Eye } from 'lucide-react'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

/** Fiche d'une rencontre planifiée (statut 'setup') : récapitulatif façon Olive
 * avec démarrage et suppression. Redirige live/terminé vers leur écran dédié. */
export function MatchPreview({ matchId }: { matchId: string }) {
  const trad = useT()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const { can, guard } = useAuth()
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [askDelete, setAskDelete] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [convoqués, setConvoqués] = useState<Set<string>>(new Set())
  const [meetTime, setMeetTime] = useState('')
  const [meetPlace, setMeetPlace] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancel = false
    getMatch(matchId).then(async (m) => {
      if (cancel || !m) { if (!cancel) setMatch(m ?? null); return }
      const ts = await listTeams()
      if (cancel) return
      setTeams(Object.fromEntries(ts.map((t) => [t.id, t])))
      setMatch(m)
    })
    return () => { cancel = true }
  }, [matchId])

  // Effectif du club et convocation déjà enregistrée : chargés une seule fois par
  // rencontre. Un rechargement déclenché par une frappe en cours (ex. un effet qui se
  // fie à « le champ est vide ») écraserait la saisie dès que l'utilisateur efface
  // pour retaper — on applique donc ces valeurs une fois, jamais en cours de saisie.
  // L'effectif est celui du club de LA RENCONTRE (`match.meta.clubId`, jamais absent),
  // pas celui du réglage d'appareil (`useClub`, préférence locale qui peut désigner un
  // autre club si l'on a changé de club depuis) : une rencontre ancienne, rouverte par
  // un lien direct après un changement de club, doit garder l'effectif à qui elle
  // appartient.
  useEffect(() => {
    if (!match) return
    let cancel = false
    Promise.all([listPlayers(match.meta.clubId), getConvocation(match.id)]).then(([ps, conv]) => {
      if (cancel) return
      setPlayers(ps)
      // Confronte les identifiants chargés à l'effectif réel : un joueur retiré de
      // l'effectif depuis peut encore figurer dans une convocation déjà enregistrée
      // (la cascade de `deletePlayer` ne répare que l'avenir), et resterait sinon
      // compté sans case à décocher.
      const rosterIds = new Set(ps.map((p) => p.id))
      setConvoqués(new Set((conv?.playerIds ?? []).filter((id) => rosterIds.has(id))))
      setMeetTime(conv?.meetTime ?? '')
      setMeetPlace(conv?.meetPlace ?? '')
      setNote(conv?.note ?? '')
    })
    return () => { cancel = true }
  }, [match?.id])

  // Arrivé par un lien « Convoquer » (tableau de bord, calendrier) : la convocation
  // est en bas de la fiche, on l'amène sous les yeux. Le défilement attend l'effectif,
  // car la section n'existe pas encore au moment du clic — les données arrivent après.
  // `scrollIntoView` est appelé prudemment : jsdom ne l'implémente pas.
  useEffect(() => {
    if (hash === '#convocation' && players.length) document.getElementById('convocation')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [hash, players.length])

  if (match === null) return <p className="py-16 text-center text-sm" style={{ color: C.muted }}>{trad('apercu.introuvable')}</p>

  const nameOf = (id: string) => teams[id]?.name ?? '—'
  const f = fmtDate(match.meta.date)
  // Deux droits différents sur cette fiche : convoquer et supprimer relèvent du
  // club, démarrer la rencontre relève de la table de marque.
  const gere = can('manage')
  const tientLaMarque = can('score')
  // Démarrer (ou reprendre) relève de la table de marque, pas de l'administration :
  // le bénévole du samedi doit pouvoir lancer la rencontre qu'il va tenir, sans le
  // code admin. Convoquer et supprimer, juste en dessous, restent administratifs.
  const start = () => guard('score', () => navigate(`/match/${match.id}/live`))
  const remove = async () => { await deleteMatch(match.id); navigate('/calendrier') }

  const basculerConvoqué = (id: string) => guard('manage', () => {
    setConvoqués((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  })
  const enregistrerConvocation = () => guard('manage', async () => {
    await saveConvocation({
      matchId: match.id, playerIds: [...convoqués],
      meetTime: meetTime.trim() || undefined, meetPlace: meetPlace.trim() || undefined, note: note.trim() || undefined,
    })
  })

  const statusPill =
    match.status === 'live' ? { label: 'En cours', bg: C.greenBg, fg: C.green }
    : match.status === 'finished' ? { label: 'Terminée', bg: C.neutralBg, fg: C.muted }
    : { label: 'À venir', bg: C.amberBg, fg: C.amber }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle action={<Link to="/calendrier" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>{trad('apercu.retourCalendrier')}</Link>} />

      <div className="rounded-2xl p-6" style={{ background: C.card, border: bd }}>
        {/* Le championnat était le « sous-titre » de la page ; ce n'en était pas un,
            c'est une information de la rencontre. Il rejoint donc le bandeau de la
            fiche, entre l'état et le numéro. */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="rounded-md px-2 py-1 text-[12px] font-black uppercase" style={{ background: statusPill.bg, color: statusPill.fg }}>{statusPill.label}</span>
          <span className="min-w-0 truncate text-[12px] font-bold" style={{ color: C.muted }}>{champLabel(match.meta)}</span>
          {match.meta.matchNumber && <span className="ml-auto text-[12px] font-bold" style={{ color: C.faint }}>{trad('apercu.rencontreNumero', { n: match.meta.matchNumber })}</span>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamCol id={match.meta.clubId} name={nameOf(match.meta.clubId)} role="Locaux" coach={match.meta.coachA} count={match.roster.length} />
          <span className="text-xl font-black" style={{ color: C.faint }}>{trad('apercu.vs')}</span>
          {/* L'adversaire n'a pas d'effectif saisi pour cette rencontre : pas de compte de joueurs à afficher. */}
          <TeamCol id={match.meta.opponentId} name={nameOf(match.meta.opponentId)} role="Visiteurs" coach={teams[match.meta.opponentId]?.coach} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-3" style={{ borderColor: C.border }}>
          <Info label={trad('match.date')} value={f.long || trad('apercu.aDefinir')} />
          <Info label={trad('match.heure')} value={match.meta.time || '—'} />
          <Info label={trad('match.lieu')} value={match.meta.venue || '—'} />
        </div>
      </div>

      {/* `scroll-mt-6` : l'ancre s'arrête sous le bord haut, pas collée à lui. */}
      <div id="convocation" className="mt-6 scroll-mt-6 rounded-2xl p-6" style={{ background: C.card, border: bd }}>
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle>{trad('apercu.convocation')}</SectionTitle>
          {/* Affiché en permanence, pas seulement après enregistrement : douze convoqués
              pour un match où l'on n'en inscrit que dix doit se voir sans compter les cases. */}
          <span className="rounded-md px-2 py-1 text-[12px] font-black" style={{ background: C.accentBg, color: C.accent }}>
            {convoqués.size} convoqué{convoqués.size > 1 ? 's' : ''}
          </span>
        </div>

        {/* Convoquer écrit ; savoir si l'on est convoqué, non — c'est même la
            première chose qu'un joueur vient lire ici. La section reste donc
            entière pour tout le monde, en cases à cocher pour qui convoque, en
            liste pour qui est convoqué. */}
        {gere ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...players].sort((a, b) => a.number - b.number).map((p) => (
                <CaseJoueur key={p.id} player={p} checked={convoqués.has(p.id)} onToggle={() => basculerConvoqué(p.id)} />
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="convoc-heure" label={trad('apercu.heureRdv')} type="time" value={meetTime} onChange={setMeetTime} />
              <Field id="convoc-lieu" label={trad('apercu.lieuRdv')} value={meetPlace} onChange={setMeetPlace} />
            </div>
            <div className="mt-4">
              <label htmlFor="convoc-note" className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{trad('apercu.consignes')}</label>
              <textarea id="convoc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                className="mt-1.5 w-full rounded-[10px] p-3 text-sm" style={{ background: C.panel, border: bd, color: C.text }} />
            </div>

            <button onClick={enregistrerConvocation} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
              {trad('apercu.enregistrerConvocation')}
            </button>

            {/* Comme les résultats du championnat : aucune synchronisation pour la convocation,
                même formulation que sur l'écran Championnat pour ne pas laisser croire à deux limites différentes. */}
            <p className="mt-4 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{trad('apercu.convocationLocale')}</p>
          </>
        ) : convoqués.size === 0 ? (
          <p className="text-sm" style={{ color: C.muted }}>{trad('apercu.personneConvoquee')}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...players].filter((p) => convoqués.has(p.id)).sort((a, b) => a.number - b.number).map((p) => (
                <span key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: C.panel }}>
                  <span className="text-xs font-black" style={{ color: C.accent }}>N°{p.number}</span>
                  {p.lastName} {p.firstName}
                </span>
              ))}
            </div>
            {(meetTime || meetPlace) && (
              <p className="mt-4 text-sm" style={{ color: C.muted }}>Rendez-vous {[meetTime, meetPlace].filter(Boolean).join(' · ')}</p>
            )}
            {note && <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: C.muted }}>{note}</p>}
          </>
        )}
      </div>

      {/* `justify-end` et non `justify-between` : sans lui, la disparition de
          « Supprimer » ferait glisser le reste de la rangée à gauche. */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {/* Le droit est vérifié à l'ouverture du dialogue, pas redérivé ensuite : qui se
            verrouille pendant que la confirmation est ouverte peut encore la confirmer.
            C'est assumé — le scénario suppose de rendre la tablette en pleine action, et
            `LiveMatch` réévalue `can()` à chaque rendu parce que la saisie du match dure
            deux heures, pas parce que les autres écrans auraient oublié de le faire. */}
        {gere && (
          <button onClick={() => guard('manage', () => setAskDelete(true))} className="mr-auto rounded-xl px-4 py-3 text-sm font-semibold" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
            {trad('commun.supprimer')}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/match/${match.id}/watch`} target="_blank" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}><Eye className="h-4 w-4" strokeWidth={2} />{trad('garde.suiviSpectateur')}</Link>
          {match.status === 'finished' ? (
            <Link to={`/match/${match.id}/summary`} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{trad('apercu.voirResume')}</Link>
          ) : (
            // Démarrer ou reprendre est le geste de la table de marque : le bouton
            // est le sien, et n'apparaît pas au visiteur qui consulte la fiche.
            tientLaMarque && (
              <button onClick={start} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
                {match.status === 'live' ? 'Reprendre la rencontre →' : '▶ Démarrer la rencontre'}
              </button>
            )
          )}
        </div>
      </div>

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={remove}
        title={trad('apercu.supprimerTitre')} message={trad('apercu.supprimerTexte')} confirmLabel={trad('commun.supprimer')} danger />
    </div>
  )
}

function TeamCol({ id, name, role, coach, count }: { id: string; name: string; role: string; coach?: string; count?: number }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamBadge id={id} name={name} size="h-14 w-14 text-sm" />
      <span className="line-clamp-2 text-base font-extrabold">{name}</span>
      <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{role}</span>
      {coach && <span className="text-[12px]" style={{ color: C.faint }}>Coach · {coach}</span>}
      {count !== undefined && <span className="text-[12px]" style={{ color: C.faint }}>{count} joueur{count > 1 ? 's' : ''}</span>}
    </div>
  )
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold capitalize">{value}</p>
    </div>
  )
}
function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field} />
    </div>
  )
}
function CaseJoueur({ player, checked, onToggle }: { player: Player; checked: boolean; onToggle: () => void }) {
  const id = `convoque-${player.id}`
  return (
    <label htmlFor={id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: C.panel }}>
      <input id={id} type="checkbox" checked={checked} onChange={onToggle} />
      <span className="text-xs font-black" style={{ color: C.accent }}>N°{player.number}</span>
      {player.lastName} {player.firstName}
    </label>
  )
}
