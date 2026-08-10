import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useClub } from '../../app/club'
import { listMatches, listPlayers, listTeams } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import { clubStanding } from '../../domain/standings'
import { teamMatches, teamRecord, teamScorers } from '../../domain/teamRecord'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { liveState } from '../../rules/ffbb'
import { ShotChart } from '../components/ShotCourt'
import { C, bd, TeamBadge, displayClock, fmtDate } from '../olive/kit'
import type { Match, Player, Team } from '../../domain/types'

export function Dashboard() {
  const { clubId, club } = useClub()
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    refresh()
      .then(() => Promise.all([listMatches(), listTeams(), listPlayers(clubId)]))
      .then(([ms, ts, ps]) => {
        if (cancelled) return
        setTeams(Object.fromEntries(ts.map((t) => [t.id, t])))
        setPlayers(ps)
        setMatches(ms)
      })
    return () => { cancelled = true }
  }, [clubId])

  if (!clubId || !club) return null
  if (!matches) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>

  const mine = matches.filter((m) => m.meta.teamAId === clubId || m.meta.teamBId === clubId)
  const live = mine.find((m) => m.status === 'live')
  const next = mine.filter((m) => m.status === 'setup').sort((a, b) => (a.meta.date ?? '').localeCompare(b.meta.date ?? ''))[0]
  const rec = teamRecord(clubId, matches)
  const lines = teamMatches(clubId, matches).filter((l) => l.result)
  const rank = clubStanding(matches, teams, clubId)
  const diff = rec.pointsFor - rec.pointsAgainst

  const rosterIds = players.map((p) => p.id)
  const clubShots = rosterIds.flatMap((id) => shotsOf(matches, id))
  const scorers = [...teamScorers(clubId, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const shownShots = openPlayer ? shotsOf(matches, openPlayer) : clubShots

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <TeamBadge id={club.id} name={club.name} size="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{club.name}</h1>
            {rank ? (
              <>
                <p className="text-sm" style={{ color: C.muted }}>{rank.rank}ᵉ sur {rank.total} · {rank.line.pts} pts</p>
                {/* Le rang seul ne dit pas de quelle compétition il vient — indispensable
                    dès qu'un club joue plusieurs championnats, cf. clubStanding. */}
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.faint }}>{rank.champ}</p>
              </>
            ) : (
              <p className="text-sm" style={{ color: C.muted }}>Aucune rencontre terminée</p>
            )}
          </div>
        </div>

        <Banner live={live} next={next} clubId={clubId} teams={teams} />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Bilan" value={`${rec.wins}V – ${rec.losses}D`} hint={rec.played ? `${rec.played} rencontres` : 'aucune'} accent={rec.wins >= rec.losses ? C.green : C.pink} />
          <Stat label="Points marqués" value={rec.played ? String(rec.avgFor) : '—'} hint="par match" />
          <Stat label="Points encaissés" value={rec.played ? String(rec.avgAgainst) : '—'} hint="par match" />
          <Stat label="Différentiel" value={rec.played ? (diff > 0 ? `+${diff}` : String(diff)) : '—'} hint="sur la saison" accent={diff > 0 ? C.green : diff < 0 ? C.pink : undefined} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Forme</span>
          {lines.slice(0, 5).map((l) => (
            <span key={l.match.id} className="grid h-6 w-6 place-items-center rounded-md text-[11px] font-black"
              style={{ background: l.result === 'V' ? C.greenBg : 'rgba(255,77,109,0.14)', color: l.result === 'V' ? C.green : C.pink }}>
              {l.result}
            </span>
          ))}
          {lines.length === 0 && <span className="text-sm" style={{ color: C.muted }}>—</span>}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_420px]">
          <Panel title="Meilleurs marqueurs">
            {scorers.length === 0 ? (
              <Empty>Pas encore de points marqués.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scorers.map(([pid, pts], i) => {
                  const p = byId[pid]
                  const pct = shootingPct(shotsOf(matches, pid)).fg
                  return (
                    <li key={pid}>
                      <Link to={`/players/${pid}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/5" style={{ background: C.panel }}>
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.orange : C.faint }}>{i + 1}</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p?.number ?? '?'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : 'Joueur'}</span>
                        <span className="text-[11px] font-semibold" style={{ color: C.muted }}>{pct === null ? '—' : `${pct} %`}</span>
                        <span className="w-14 text-right text-sm font-black tabular-nums">{pts} pts</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title={openPlayer ? `Hot zone — ${byId[openPlayer]?.lastName ?? 'joueur'}` : 'Hot zone — équipe'}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip active={!openPlayer} onClick={() => setOpenPlayer(null)}>Équipe</Chip>
              {players.map((p) => (
                <Chip key={p.id} active={openPlayer === p.id} onClick={() => setOpenPlayer(p.id)}>{p.number}</Chip>
              ))}
            </div>
            {shownShots.length === 0 ? <Empty>Aucun tir localisé pour l’instant.</Empty> : <ShotChart shots={shownShots} minAttempts={openPlayer ? 1 : 3} />}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Banner({ live, next, clubId, teams }: { live?: Match; next?: Match; clubId: string; teams: Record<string, Team> }) {
  const opponent = (m: Match) => teams[m.meta.teamAId === clubId ? m.meta.teamBId : m.meta.teamAId]?.name ?? 'Adversaire'
  if (live) {
    const ls = liveState(live)
    const dc = displayClock(live)
    const mine = live.meta.teamAId === clubId ? ls.score.a : ls.score.b
    const opp = live.meta.teamAId === clubId ? ls.score.b : ls.score.a
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accent}55` }}>
        <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: C.greenBg, color: C.green }}>En direct</span>
        <span className="nums text-3xl font-black tabular-nums">{mine} – {opp}</span>
        <span className="text-sm font-bold" style={{ color: C.muted }}>contre {opponent(live)}</span>
        <span className="nums text-sm font-bold" style={{ color: C.faint }}>{dc.label} · {dc.clock}</span>
        <Link to={`/match/${live.id}/live`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
          Ouvrir la table de marque →
        </Link>
      </div>
    )
  }
  if (next) {
    const f = fmtDate(next.meta.date)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Prochaine rencontre</span>
        <span className="text-sm font-bold">contre {opponent(next)}</span>
        <span className="text-sm" style={{ color: C.muted }}>{[f.long, next.meta.time, next.meta.venue].filter(Boolean).join(' · ')}</span>
        <Link to={`/match/${next.id}`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>Voir la fiche →</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-sm" style={{ color: C.muted }}>Aucune rencontre prévue.</span>
      <Link to="/match/new" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>+ Planifier une rencontre</Link>
    </div>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
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
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition"
      style={active ? { background: C.accent, color: '#fff' } : { background: C.card2, color: C.muted, border: bd }}>
      {children}
    </button>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
