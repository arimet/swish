import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMatches, listTeams, listPlayers } from '../../persistence/repositories'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import type { Match, Player, Team } from '../../domain/types'
import { C, bd, MatchCard, initials, fmtDate, displayClock, champLabel } from '../olive/kit'

type Status = 'live' | 'setup' | 'finished'
type Loaded = { matches: Match[]; teams: Record<string, Team>; players: Record<string, Player> }

export function Home() {
  const navigate = useNavigate()
  const [data, setData] = useState<Loaded | null>(null)
  const [tab, setTab] = useState<Status>('live')
  const [date, setDate] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    Promise.all([listMatches(), listTeams()]).then(async ([matches, teams]) => {
      const players = (await Promise.all(teams.map((t) => listPlayers(t.id)))).flat()
      if (cancel) return
      setData({ matches, teams: Object.fromEntries(teams.map((t) => [t.id, t])), players: Object.fromEntries(players.map((p) => [p.id, p])) })
    })
    return () => { cancel = true }
  }, [])

  const dates = useMemo(() => {
    if (!data) return []
    const s = new Set<string>()
    for (const m of data.matches) if (m.meta.date) s.add(m.meta.date)
    return [...s].sort()
  }, [data])

  if (!data) return <div className="p-6"><div className="h-64 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  const { matches, teams, players } = data
  const featured = matches.find((m) => m.status === 'live')
  const list = matches.filter((m) => m.status === tab && (!date || m.meta.date === date))
  const tabs: { k: Status; l: string; n: number }[] = [
    { k: 'live', l: 'En cours', n: matches.filter((m) => m.status === 'live').length },
    { k: 'setup', l: 'À venir', n: matches.filter((m) => m.status === 'setup').length },
    { k: 'finished', l: 'Terminées', n: matches.filter((m) => m.status === 'finished').length },
  ]

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
          {featured
            ? <Hero match={featured} teams={teams} onOpen={() => navigate(`/match/${featured.id}/live`)} />
            : <div className="flex h-[290px] flex-col items-center justify-center gap-3 rounded-2xl" style={{ border: bd, background: C.card }}>
                <p className="text-sm" style={{ color: C.muted }}>Aucune rencontre en cours.</p>
                <button onClick={() => navigate('/match/new')} className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: C.orange }}>+ Nouvelle rencontre</button>
              </div>}
          <TopScorers match={featured} players={players} teams={teams} />
        </div>

        <div className="mb-3 mt-7 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-2xl p-1" style={{ background: C.card, border: bd }}>
            {tabs.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)} className="flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-bold transition"
                style={tab === t.k ? { background: C.orange, color: '#151515' } : { color: C.muted }}>
                {t.l}<span className="rounded-full px-1.5 text-xs" style={{ background: tab === t.k ? 'rgba(0,0,0,0.15)' : C.card2 }}>{t.n}</span>
              </button>
            ))}
          </div>
          {date && <button onClick={() => setDate(null)} className="text-xs font-bold" style={{ color: C.orange }}>Tout voir</button>}
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {dates.map((iso) => {
            const f = fmtDate(iso); const active = date === iso
            return (
              <button key={iso} onClick={() => setDate(active ? null : iso)} className="shrink-0 rounded-2xl px-4 py-3 text-center"
                style={active ? { background: 'linear-gradient(135deg,#ffe07a,#ff9d3d)', border: '1px solid transparent', color: '#3a2600' } : { background: C.card, border: bd }}>
                <div className="text-lg font-black leading-none">{f.day}</div>
                <div className="mt-1 text-[10px] font-bold" style={{ color: active ? '#6b4a00' : C.muted }}>{f.wd}</div>
              </button>
            )
          })}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {list.length === 0
            ? <p className="col-span-full rounded-2xl border border-dashed py-12 text-center text-sm" style={{ border: bd, color: C.muted }}>Aucune rencontre.</p>
            : list.map((m) => <MatchCard key={m.id} m={m} teams={teams} />)}
        </div>
      </div>
    </div>
  )
}

function Hero({ match, teams, onOpen }: { match: Match; teams: Record<string, Team>; onOpen: () => void }) {
  const a = teams[match.meta.teamAId]?.name ?? 'A', b = teams[match.meta.teamBId]?.name ?? 'B'
  const { score } = liveState(match); const dc = displayClock(match)
  return (
    <button onClick={onOpen} className="relative h-[290px] overflow-hidden rounded-2xl p-6 text-left" style={{ border: bd, background: 'linear-gradient(115deg,#1a1a1e 0%,#201a1a 45%,#3a1220 72%,#7a1420 100%)' }}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
          Live · {champLabel(match.meta)}
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">{dc.label} · {dc.clock}</span>
      </div>
      <div className="relative mt-8 space-y-4">
        {[[a, score.a, '#fff', score.a > score.b], [b, score.b, C.orange, score.b > score.a]].map(([n, s, col, lead], i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-black" style={{ background: col as string, color: '#151515' }}>{initials(n as string)}</span>
            <span className="min-w-0 flex-1 truncate text-lg font-extrabold" style={{ opacity: lead ? 1 : 0.7 }}>{n as string}</span>
            <span className="text-4xl font-black tabular-nums" style={{ color: col as string }}>{s as number}</span>
          </div>
        ))}
      </div>
      <span className="absolute bottom-6 left-6 rounded-full bg-white/10 px-4 py-2 text-sm font-bold">Reprendre le match →</span>
    </button>
  )
}

function TopScorers({ match, players, teams }: { match?: Match; players: Record<string, Player>; teams: Record<string, Team> }) {
  const rows = match ? (['A', 'B'] as const).flatMap((s) => playerStats(match, s).map((st) => ({ st, s }))).filter((r) => r.st.points > 0).sort((x, y) => y.st.points - x.st.points).slice(0, 4) : []
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-extrabold">🔥 Meilleurs marqueurs</span>
      </div>
      <div className="rounded-2xl p-2" style={{ background: C.card, border: bd }}>
        {rows.length === 0
          ? <p className="py-10 text-center text-sm" style={{ color: C.muted }}>Pas encore de panier.</p>
          : rows.map(({ st, s }, i) => {
            const p = players[st.playerId]; const col = s === 'A' ? '#fff' : C.orange
            return (
              <div key={st.playerId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="w-4 text-center text-xs font-black" style={{ color: C.faint }}>{i + 1}</span>
                <span className="grid h-9 w-9 place-items-center rounded-xl text-xs font-black" style={{ background: col, color: '#151515' }}>{p?.number ?? '?'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{p?.lastName ?? st.playerId}</span>
                  <span className="block text-[11px]" style={{ color: C.faint }}>{teams[s === 'A' ? match!.meta.teamAId : match!.meta.teamBId]?.name}</span>
                </span>
                <span className="text-lg font-black tabular-nums">{st.points}<span className="ml-0.5 text-[11px]" style={{ color: C.faint }}>pts</span></span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
