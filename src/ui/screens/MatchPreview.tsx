import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMatch, listTeams, deleteMatch } from '../../persistence/repositories'
import type { Match, Team } from '../../domain/types'
import { C, bd, PageTitle, TeamBadge, fmtDate, champLabel } from '../olive/kit'
import { useAdmin } from '../../app/admin'
import { ConfirmDialog } from '../components/ConfirmDialog'

/** Fiche d'une rencontre planifiée (statut 'setup') : récapitulatif façon Olive
 * avec démarrage et suppression. Redirige live/terminé vers leur écran dédié. */
export function MatchPreview({ matchId }: { matchId: string }) {
  const navigate = useNavigate()
  const { guard } = useAdmin()
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [askDelete, setAskDelete] = useState(false)

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

  if (match === null) return <p className="py-16 text-center text-sm" style={{ color: C.muted }}>Rencontre introuvable.</p>

  const nameOf = (id: string) => teams[id]?.name ?? '—'
  const f = fmtDate(match.meta.date)
  const start = () => guard(() => navigate(`/match/${match.id}/live`))
  const remove = async () => { await deleteMatch(match.id); navigate('/calendrier') }

  const statusPill =
    match.status === 'live' ? { label: 'En cours', bg: C.greenBg, fg: C.green }
    : match.status === 'finished' ? { label: 'Terminée', bg: 'rgba(255,255,255,0.08)', fg: C.muted }
    : { label: 'À venir', bg: C.amberBg, fg: C.amber }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle subtitle={champLabel(match.meta)}
        action={<Link to="/calendrier" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>← Calendrier</Link>} />

      <div className="rounded-2xl p-6" style={{ background: C.card, border: bd }}>
        <div className="mb-5 flex items-center justify-between">
          <span className="rounded-md px-2 py-1 text-[11px] font-black uppercase" style={{ background: statusPill.bg, color: statusPill.fg }}>{statusPill.label}</span>
          {match.meta.matchNumber && <span className="text-[11px] font-bold" style={{ color: C.faint }}>Rencontre n°{match.meta.matchNumber}</span>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamCol id={match.meta.clubId} name={nameOf(match.meta.clubId)} role="Locaux" coach={match.meta.coachA} count={match.roster.length} />
          <span className="text-xl font-black" style={{ color: C.faint }}>VS</span>
          {/* L'adversaire n'a pas d'effectif saisi pour cette rencontre : pas de compte de joueurs à afficher. */}
          <TeamCol id={match.meta.opponentId} name={nameOf(match.meta.opponentId)} role="Visiteurs" coach={teams[match.meta.opponentId]?.coach} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-3" style={{ borderColor: C.border }}>
          <Info label="Date" value={f.long || 'À définir'} />
          <Info label="Heure" value={match.meta.time || '—'} />
          <Info label="Lieu" value={match.meta.venue || '—'} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => guard(() => setAskDelete(true))} className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
          Supprimer
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/match/${match.id}/watch`} target="_blank" className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}>👁 Suivi spectateur</Link>
          {match.status === 'finished' ? (
            <Link to={`/match/${match.id}/summary`} className="rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: C.accent }}>Voir le résumé →</Link>
          ) : (
            <button onClick={start} className="rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: C.accent }}>
              {match.status === 'live' ? 'Reprendre la rencontre →' : '▶ Démarrer la rencontre'}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={remove}
        title="Supprimer la rencontre ?" message="Cette action est définitive." confirmLabel="Supprimer" danger />
    </div>
  )
}

function TeamCol({ id, name, role, coach, count }: { id: string; name: string; role: string; coach?: string; count?: number }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamBadge id={id} name={name} size="h-14 w-14 text-sm" />
      <span className="line-clamp-2 text-base font-extrabold">{name}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{role}</span>
      {coach && <span className="text-[11px]" style={{ color: C.faint }}>Coach · {coach}</span>}
      {count !== undefined && <span className="text-[11px]" style={{ color: C.faint }}>{count} joueur{count > 1 ? 's' : ''}</span>}
    </div>
  )
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold capitalize">{value}</p>
    </div>
  )
}
