import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlayer, getTeam, listMatches } from '../../persistence/repositories'
import { refresh as refreshRemote } from '../../persistence/remote'
import { playerStats } from '../../domain/boxscore'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
import { C, bd, TeamBadge, champLabel, fmtDate } from '../olive/kit'
import type { Match, Player, Team } from '../../domain/types'

export function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const [player, setPlayer] = useState<Player | null | undefined>(undefined)
  const [team, setTeam] = useState<Team | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [openMatch, setOpenMatch] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    refreshRemote()
      .then(() => getPlayer(id))
      .then(async (p) => {
        if (cancelled) return
        if (!p) { setPlayer(null); return }
        const [t, all] = await Promise.all([getTeam(p.teamId), listMatches()])
        if (cancelled) return
        setTeam(t ?? null)
        // Rencontres où le joueur figure à l'effectif et qui ont commencé.
        setMatches(all.filter((m) => m.status !== 'setup' && m.roster.includes(id)))
        setPlayer(p)
      })
    return () => { cancelled = true }
  }, [id])

  if (!id) return null
  if (player === undefined) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (player === null)
    return (
      <div className="p-6">
        <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
          Joueur introuvable. <Link to="/teams" className="font-bold" style={{ color: C.accent }}>← Équipes</Link>
        </p>
      </div>
    )

  const lineOf = (m: Match) => playerStats(m).find((s) => s.playerId === id)
  const totalPoints = matches.reduce((n, m) => n + (lineOf(m)?.points ?? 0), 0)
  const career = shotsOf(matches, id)
  const pct = shootingPct(career)
  const played = matches.length
  const ordered = [...matches].sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? ''))

  return (
    <div className="p-6">
      <Link to={team ? `/teams/${team.id}` : '/teams'} className="inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>
        ← {team?.name ?? 'Équipes'}
      </Link>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <span className="nums grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold" style={{ background: C.accentBg, color: C.accent }}>
          {player.number}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{player.lastName} {player.firstName}</h1>
          {team && <p className="flex items-center gap-2 text-sm" style={{ color: C.muted }}><TeamBadge id={team.id} name={team.name} size="h-5 w-5 text-[8px]" />{team.name}</p>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rencontres" value={String(played)} hint="jouées" />
        <StatCard label="Points / match" value={played ? String(Math.round(totalPoints / played)) : '—'} hint={`${totalPoints} au total`} />
        <StatCard label="Réussite aux tirs" value={pct.fg === null ? '—' : `${pct.fg} %`} hint={`${career.length} tir${career.length > 1 ? 's' : ''} localisé${career.length > 1 ? 's' : ''}`} accent={C.accent} />
        <StatCard label="Réussite à 3 pts" value={pct.three === null ? '—' : `${pct.three} %`} hint="sur la carrière" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Panel title="Hot zone — carrière">
          {career.length === 0 ? (
            <Empty>Aucun tir localisé pour l’instant.</Empty>
          ) : (
            <ShotChart shots={career} />
          )}
        </Panel>

        <Panel title="Rencontres">
          {ordered.length === 0 ? (
            <Empty>Aucune rencontre jouée.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ordered.map((m) => {
                const s = lineOf(m)
                const shots = shotsOf([m], id)
                const isOpen = openMatch === m.id
                return (
                  <li key={m.id} className="rounded-xl" style={{ background: C.panel }}>
                    <button onClick={() => setOpenMatch(isOpen ? null : m.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{champLabel(m.meta)}</span>
                      <span className="shrink-0 text-[11px] font-semibold" style={{ color: C.faint }}>{fmtDate(m.meta.date).long || '—'}</span>
                      <span className="nums w-14 shrink-0 text-right text-sm font-black">{s?.points ?? 0} pts</span>
                      <span style={{ color: C.faint }}>{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 py-3" style={{ borderColor: C.border }}>
                        <p className="mb-2 text-[11px] font-semibold" style={{ color: C.muted }}>
                          {s?.fieldGoalsMade ?? 0} tir{(s?.fieldGoalsMade ?? 0) > 1 ? 's' : ''} réussi{(s?.fieldGoalsMade ?? 0) > 1 ? 's' : ''} ·
                          {' '}{s?.misses ?? 0} manqué{(s?.misses ?? 0) > 1 ? 's' : ''} · {s?.fouls ?? 0} faute{(s?.fouls ?? 0) > 1 ? 's' : ''}
                        </p>
                        {shots.length === 0 ? <Empty>Aucun tir localisé sur cette rencontre.</Empty> : <ShotChart shots={shots} minAttempts={1} />}
                        <Link to={`/match/${m.id}/summary`} className="mt-2 inline-block text-xs font-bold" style={{ color: C.accent }}>
                          Voir la feuille de match →
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
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
