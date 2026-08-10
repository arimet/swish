import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { getTeam, listPlayers, listMatches, listTeams, savePlayer, deletePlayer, deleteTeam, saveTeam } from '../../persistence/repositories'
import { teamRecord, teamMatches, teamScorers } from '../../domain/teamRecord'
import type { Match, Player, Team } from '../../domain/types'
import { C, bd, TeamBadge, fmtDate } from '../olive/kit'
import { useAdmin } from '../../app/admin'
import { useClub } from '../../app/club'
import { refresh as refreshRemote } from '../../persistence/remote'
import { ConfirmDialog } from '../components/ConfirmDialog'

const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }

export function TeamDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { guard } = useAdmin()
  const { clubId, clear } = useClub()
  const [askDelete, setAskDelete] = useState(false)
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({})
  const [coach, setCoach] = useState('')
  const [num, setNum] = useState(''); const [ln, setLn] = useState(''); const [fn, setFn] = useState('')

  const refresh = () => { if (id) listPlayers(id).then(setPlayers) }
  useEffect(() => {
    if (!id) return
    refreshRemote()
      .then(() => getTeam(id).then((t) => { setTeam(t ?? null); setCoach(t?.coach ?? '') }))
      .then(refresh)
      .then(() => Promise.all([listMatches(), listTeams()]))
      .then(([ms, ts]) => { setMatches(ms); setTeamsById(Object.fromEntries(ts.map((x) => [x.id, x]))) })
  }, [id])

  if (!id) return null
  if (team === undefined) return <div className="p-6"><div className="h-24 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (team === null) return <div className="p-6"><p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>Équipe introuvable. <Link to="/teams" className="font-bold" style={{ color: C.accent }}>← Retour</Link></p></div>

  const saveCoach = () => {
    if (coach === (team.coach ?? '')) return
    guard(() => saveTeam({ ...team, coach: coach.trim() || undefined }).then(() => setTeam({ ...team, coach: coach.trim() || undefined })))
  }
  const addPlayer = () => guard(async () => {
    if (!num || !ln.trim()) return
    await savePlayer({ id: newId(), teamId: id, number: Number(num), lastName: ln.trim().toUpperCase(), firstName: fn.trim() })
    setNum(''); setLn(''); setFn(''); refresh()
  })
  const removePlayer = (pid: string) => guard(async () => { await deletePlayer(pid); refresh() })
  const removeTeam = async () => {
    await deleteTeam(id)
    // Le club suivi disparaît avec sa propre équipe : sans ce `clear()`, le
    // tableau de bord resterait épinglé sur un club fantôme (ClubProvider ne
    // revalide sa liste qu'à un changement de club, pas à une suppression brute).
    if (id === clubId) clear()
    navigate('/teams')
  }

  const rec = teamRecord(id, matches)
  const lines = teamMatches(id, matches)
  const upcoming = lines.filter((l) => l.match.status !== 'finished')
  const scorers = [...teamScorers(id, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const playerById = Object.fromEntries(players.map((p) => [p.id, p]))
  const diff = rec.pointsFor - rec.pointsAgainst

  return (
    <div className="p-6">
      <Link to="/teams" className="inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>← Équipes</Link>
      <div className="mb-6 mt-4 flex items-center gap-3">
        <TeamBadge id={id} name={team.name} size="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{team.name}</h1>
          <p className="text-sm" style={{ color: C.muted }}>{players.length} joueur{players.length > 1 ? 's' : ''}{team.coach ? ` · Coach ${team.coach}` : ''}</p>
        </div>
        <button onClick={() => guard(() => setAskDelete(true))} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${C.pink}55`, color: C.pink }}>Supprimer</button>
      </div>
      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={removeTeam}
        title="Supprimer l'équipe ?" message={`« ${team.name} » et tous ses joueurs seront supprimés. Cette action est définitive.`} confirmLabel="Supprimer" danger />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rencontres" value={String(rec.played)} hint={upcoming.length ? `${upcoming.length} à venir` : 'jouées'} />
        <StatCard label="Bilan" value={`${rec.wins}V – ${rec.losses}D`} hint={rec.played ? `${Math.round((rec.wins / rec.played) * 100)}% de victoires` : '—'} accent={rec.wins >= rec.losses ? C.green : C.pink} />
        <StatCard label="Points marqués" value={rec.played ? String(rec.avgFor) : '—'} hint={rec.played ? `${rec.pointsFor} au total` : 'par match'} />
        <StatCard label="Différentiel" value={rec.played ? (diff > 0 ? `+${diff}` : String(diff)) : '—'} hint={rec.played ? `${rec.avgAgainst} encaissés/match` : 'pour – contre'} accent={diff > 0 ? C.green : diff < 0 ? C.pink : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title="Derniers matchs">
            {lines.length === 0 ? (
              <Empty>Aucune rencontre pour cette équipe.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {lines.slice(0, 8).map((l) => {
                  const opp = teamsById[l.opponentId]?.name ?? 'Adversaire'
                  const f = fmtDate(l.match.meta.date)
                  const to = l.match.status === 'finished' ? `/match/${l.match.id}/summary` : l.match.status === 'live' ? `/match/${l.match.id}/live` : `/match/${l.match.id}`
                  return (
                    <li key={l.match.id}>
                      <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5" style={{ background: C.panel }}>
                        {l.result && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black" style={{ background: l.result === 'V' ? C.greenBg : 'rgba(255,77,109,0.14)', color: l.result === 'V' ? C.green : C.pink }}>{l.result}</span>}
                        {!l.result && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-black" style={{ background: C.amberBg, color: C.amber }}>·</span>}
                        <TeamBadge id={l.opponentId} name={opp} size="h-7 w-7 text-[9px]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{opp}</span>
                        <span className="shrink-0 text-[11px] font-semibold" style={{ color: C.faint }}>{f.long || '—'}</span>
                        <span className="w-16 shrink-0 text-right text-sm font-black tabular-nums">{l.scored === null ? '—' : `${l.scored}–${l.conceded}`}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Meilleurs marqueurs">
            {scorers.length === 0 ? (
              <Empty>Pas encore de points marqués.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scorers.map(([pid, pts], i) => {
                  const p = playerById[pid]
                  return (
                    <li key={pid} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                      <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.orange : C.faint }}>{i + 1}</span>
                      <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p?.number ?? '?'}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : 'Joueur'}</span>
                      <span className="text-sm font-black tabular-nums" style={{ color: C.text }}>{pts} <span className="text-[11px] font-semibold" style={{ color: C.muted }}>pts</span></span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Effectif">
            <label htmlFor="coach" className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Entraîneur</label>
            <input id="coach" value={coach} onChange={(e) => setCoach(e.target.value)} onBlur={saveCoach} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="Nom de l'entraîneur" style={{ ...field, width: '100%' }} className="mb-4" />
            <ul className="mb-4 space-y-1.5">
              {[...players].sort((a, b) => a.number - b.number).map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <Link to={`/players/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                    <span className="font-semibold">{p.lastName}</span><span style={{ color: C.muted }}>{p.firstName}</span>
                  </Link>
                  <button onClick={() => removePlayer(p.id)} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold" style={{ color: C.pink }}>retirer</button>
                </li>
              ))}
              {players.length === 0 && <li className="text-sm" style={{ color: C.muted }}>Aucun joueur. Ajoutez-en ci-dessous.</li>}
            </ul>
            <div className="space-y-2">
              <div className="grid grid-cols-[56px_1fr] gap-2">
                <input placeholder="N°" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" style={{ ...field, textAlign: 'center' }} />
                <input placeholder="Nom" value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} style={field} />
              </div>
              <div className="grid grid-cols-[1fr_44px] gap-2">
                <input placeholder="Prénom" value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} style={field} />
                <button onClick={addPlayer} aria-label="Ajouter le joueur" className="grid h-11 w-11 place-items-center rounded-xl text-xl font-bold text-white" style={{ background: C.accent }}>+</button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{title}</p>
      {children}
    </section>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
