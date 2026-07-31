import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PrintableSummary } from '../../export/PrintableSummary'
import { ProgressionChart } from '../../export/ProgressionChart'
import { printSummary } from '../../export/print'
import { MatchMetaDialog } from '../components/MatchMetaDialog'
import { useAdmin } from '../../app/admin'
import { publishBundle } from '../../app/sync'
import { getMatch, listPlayers, listTeams, saveMatch } from '../../persistence/repositories'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { playingTimes } from '../../domain/playingtime'
import { teamTotals } from '../../domain/totals'
import { matchRatios, scoreProgression } from '../../domain/progression'
import { fmt } from '../components/GameClock'
import { C, bd, TeamBadge, teamColor, fmtDate, champLabel } from '../olive/kit'
import type { Match, Player, TeamSide } from '../../domain/types'

export function SummaryScreen({ matchId, onHome }: { matchId: string; onHome: () => void }) {
  const { guard } = useAdmin()
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<Record<TeamSide, string>>({ A: '', B: '' })
  const [showEdit, setShowEdit] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMatch(matchId).then(async (m) => {
      if (cancelled) return
      if (!m) { setMatch(null); return }
      const [pa, pb, teams] = await Promise.all([listPlayers(m.meta.teamAId), listPlayers(m.meta.teamBId), listTeams()])
      if (cancelled) return
      const map: Record<string, Player> = {}
      for (const p of [...pa, ...pb]) map[p.id] = p
      setPlayers(map)
      setTeamNames({
        A: teams.find((t) => t.id === m.meta.teamAId)?.name ?? 'Locaux',
        B: teams.find((t) => t.id === m.meta.teamBId)?.name ?? 'Visiteurs',
      })
      setMatch(m)
    })
    return () => { cancelled = true }
  }, [matchId])

  if (match === undefined) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (match === null) return <div className="p-6"><p className="py-16 text-center text-sm" style={{ color: C.muted }}>Rencontre introuvable.</p></div>

  const { score } = liveState(match)
  const ratios = matchRatios(match)
  const f = fmtDate(match.meta.date)
  const meta = match.meta

  const saveMeta = async (patch: Partial<Match['meta']>) => {
    const next = { ...match, meta: { ...match.meta, ...patch } }
    await saveMatch(next)
    setMatch(next)
    publishBundle({ match: next, players: Object.values(players), teamNames })
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onHome} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>← Accueil</button>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`/match/${match.id}/watch`} target="_blank" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.muted }}>👁 Suivi</Link>
          <button onClick={() => guard(() => setShowEdit(true))} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>✎ Modifier</button>
          <button onClick={printSummary} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>⬇ Exporter en PDF</button>
        </div>
      </div>
      <MatchMetaDialog open={showEdit} meta={match.meta} onClose={() => setShowEdit(false)} onSave={saveMeta} />

      {/* SCOREBOARD FINAL */}
      <div className="overflow-hidden rounded-3xl" style={{ background: C.frame, border: bd }}>
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="truncate text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{champLabel(meta)}</span>
          <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: 'rgba(255,255,255,0.08)', color: C.muted }}>Final</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-5 sm:gap-8">
          <FinalSide id={meta.teamAId} name={teamNames.A} score={score.a} win={score.a >= score.b} align="right" />
          <span className="text-lg font-black" style={{ color: C.faint }}>–</span>
          <FinalSide id={meta.teamBId} name={teamNames.B} score={score.b} win={score.b > score.a} align="left" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t px-6 py-3 text-[11px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
          {meta.matchNumber && <span>Rencontre n°{meta.matchNumber}</span>}
          {f.long && <span className="capitalize">{f.long}</span>}
          {meta.venue && <span>{meta.venue}</span>}
          {(meta.referee1 || meta.referee2) && <span>Arbitres · {[meta.referee1, meta.referee2].filter(Boolean).join(', ')}</span>}
        </div>
      </div>

      {/* TABLEAUX PAR ÉQUIPE */}
      <div className="mt-6 space-y-6">
        {(['A', 'B'] as TeamSide[]).map((side) => (
          <TeamTable key={side} match={match} side={side} players={players} name={teamNames[side]} teamId={side === 'A' ? meta.teamAId : meta.teamBId} />
        ))}
      </div>

      {/* INDICATEURS */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Plus large écart" a={ratios.A.maxLead} b={ratios.B.maxLead} />
        <Stat label="Plus longue série" a={ratios.A.maxRun} b={ratios.B.maxRun} />
        <Stat label="Points du banc" a={teamTotals(match, 'A').bench.points} b={teamTotals(match, 'B').bench.points} />
        <Stat label="Temps en tête" a={fmt(ratios.A.leadDurationSec)} b={fmt(ratios.B.leadDurationSec)} />
        <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Égalités</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{ratios.ties}</p>
        </div>
      </div>

      {/* PROGRESSION */}
      <section className="mt-6 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Progression du score</p>
          <span className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-2"><span className="h-1 w-6 rounded-full" style={{ background: teamColor(meta.teamAId) }} /><span style={{ color: C.text }}>{teamNames.A}</span></span>
            <span className="flex items-center gap-2"><span className="h-1 w-6 rounded-full" style={{ background: teamColor(meta.teamBId), backgroundImage: `repeating-linear-gradient(90deg, ${teamColor(meta.teamBId)} 0 5px, transparent 5px 8px)` }} /><span style={{ color: C.text }}>{teamNames.B}</span></span>
          </span>
        </div>
        <div className="overflow-x-auto" style={{ color: C.muted }}>
          <ProgressionChart points={scoreProgression(match)} colorA={teamColor(meta.teamAId)} colorB={teamColor(meta.teamBId)} />
        </div>
      </section>

      {/* Feuille imprimable (masquée à l'écran, visible à l'impression) */}
      <PrintableSummary match={match} players={players} teamNames={teamNames} />
    </div>
  )
}

function FinalSide({ id, name, score, win, align }: { id: string; name: string; score: number; win: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <TeamBadge id={id} name={name} size="h-11 w-11 text-xs" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold" style={{ color: win ? C.text : C.muted }}>{name}</p>
        <p className="text-5xl font-black tabular-nums sm:text-6xl" style={{ color: win ? teamColor(id) : C.muted, opacity: win ? 1 : 0.8 }}>{score}</p>
      </div>
    </div>
  )
}

function Stat({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-lg font-black tabular-nums">
        <span>{a}</span><span className="text-xs font-bold" style={{ color: C.faint }}>/</span><span>{b}</span>
      </p>
    </div>
  )
}

function TeamTable({ match, side, players, name, teamId }: { match: Match; side: TeamSide; players: Record<string, Player>; name: string; teamId: string }) {
  const stats = playerStats(match, side)
  const times = playingTimes(match, side)
  const totals = teamTotals(match, side)
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: bd }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(teamId) }} />
        <h3 className="text-sm font-extrabold uppercase tracking-wide">{side === 'A' ? 'Locaux' : 'Visiteurs'} · {name}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase" style={{ color: C.faint }}>
              <Th left>N°</Th><Th left>Joueur</Th><Th>5</Th><Th>Tps</Th><Th>Pts</Th><Th>Tirs</Th><Th>3pts</Th><Th>2 Int</Th><Th>2 Ext</Th><Th>LF</Th><Th>PD</Th><Th>RO</Th><Th>RD</Th><Th>CT</Th><Th>Ftes</Th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const p = players[s.playerId]
              const dnp = (times.get(s.playerId) ?? 0) === 0 && s.points === 0 && s.fouls === 0
              return (
                <tr key={s.playerId} style={{ borderTop: `1px solid ${C.border}`, opacity: dnp ? 0.5 : 1 }}>
                  <Td left><span className="font-black">{p?.number ?? '—'}</span></Td>
                  <Td left>{p ? `${p.lastName} ${p.firstName}` : s.playerId}</Td>
                  <Td>{s.isStarter ? '●' : ''}</Td>
                  <Td>{fmt(times.get(s.playerId) ?? 0)}</Td>
                  <Td><span className="font-black" style={{ color: s.points > 0 ? C.text : C.faint }}>{s.points}</span></Td>
                  <Td>{s.fieldGoalsMade}</Td><Td>{s.threes}</Td><Td>{s.twoInside}</Td><Td>{s.twoOutside}</Td><Td>{s.freeThrows}</Td>
                  <Td>{s.assists}</Td><Td>{s.offRebounds}</Td><Td>{s.defRebounds}</Td><Td>{s.blocks}</Td>
                  <Td><span style={{ color: s.fouls >= 5 ? C.pink : undefined }}>{s.fouls}</span></Td>
                </tr>
              )
            })}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
              <Td left></Td><Td left><span className="font-black uppercase text-[12px]">Total équipe</span></Td><Td></Td><Td></Td>
              <Td><span className="font-black" style={{ color: teamColor(teamId) }}>{totals.team.points}</span></Td>
              <Td><b>{totals.team.fieldGoalsMade}</b></Td><Td><b>{totals.team.threes}</b></Td><Td><b>{totals.team.twoInside}</b></Td><Td><b>{totals.team.twoOutside}</b></Td><Td><b>{totals.team.freeThrows}</b></Td>
              <Td><b>{totals.team.assists}</b></Td><Td><b>{totals.team.offRebounds}</b></Td><Td><b>{totals.team.defRebounds}</b></Td><Td><b>{totals.team.blocks}</b></Td>
              <Td><b>{totals.team.fouls}</b></Td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
function Th({ children, left }: { children?: ReactNode; left?: boolean }) {
  return <th className={`px-3 py-2.5 ${left ? 'text-left' : 'text-center'}`}>{children}</th>
}
function Td({ children, left }: { children?: ReactNode; left?: boolean }) {
  return <td className={`px-3 py-2.5 tabular-nums ${left ? 'text-left' : 'text-center'}`} style={{ color: '#c4c4ca' }}>{children}</td>
}
