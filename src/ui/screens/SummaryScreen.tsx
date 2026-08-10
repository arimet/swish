import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PrintableSummary } from '../../export/PrintableSummary'
import { ProgressionChart } from '../../export/ProgressionChart'
import { printSummary } from '../../export/print'
import { MatchMetaDialog } from '../components/MatchMetaDialog'
import { PlayerActionDialog } from '../components/PlayerActionDialog'
import { useAdmin } from '../../app/admin'
import { publishBundle } from '../../app/sync'
import { getMatch, listPlayers, listTeams, saveMatch } from '../../persistence/repositories'
import { flushNow } from '../../persistence/remote'
import { removeLastEvent } from '../../domain/reducer'
import { newId } from '../../domain/ids'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { shotsOf } from '../../domain/shotchart'
import { playingTimes } from '../../domain/playingtime'
import { teamTotals } from '../../domain/totals'
import { matchRatios, scoreProgression } from '../../domain/progression'
import { fmt } from '../components/GameClock'
import { C, bd, TeamBadge, teamColor, fmtDate, champLabel } from '../olive/kit'
import type { GameEvent, Match, Player, ScoreKind, ShotSpot, StatKind, TeamSide } from '../../domain/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

export function SummaryScreen({ matchId, onHome }: { matchId: string; onHome: () => void }) {
  const { guard } = useAdmin()
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<Record<TeamSide, string>>({ A: '', B: '' })
  const [showEdit, setShowEdit] = useState(false)
  const [editStats, setEditStats] = useState(false)
  const [pick, setPick] = useState<{ side: TeamSide; id: string; name: string } | null>(null)

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

  const ls = liveState(match)
  const score = ls.score
  const ratios = matchRatios(match)
  const f = fmtDate(match.meta.date)
  const meta = match.meta

  const persist = async (next: Match) => {
    setMatch(next)
    await saveMatch(next)
    publishBundle({ match: next, players: Object.values(players), teamNames })
    // Envoi immédiat (pas d'attente du débounce de 700 ms), une fois l'écriture
    // dans la file confirmée : une correction de stats ici est typiquement
    // suivie d'une navigation qui peut déclencher une hydratation ailleurs.
    void flushNow()
  }
  const saveMeta = async (patch: Partial<Match['meta']>) => persist({ ...match, meta: { ...match.meta, ...patch } })

  // Correction des stats après le match (réservé admin) : on ajoute/retire des évènements.
  const addEvent = (e: EventInput) =>
    persist({ ...match, events: [...match.events, { ...e, id: newId(), wallClock: Date.now() } as GameEvent] })
  const removeLast = (pred: (e: GameEvent) => boolean) => {
    const next = removeLastEvent(match, pred)
    if (next !== match) persist(next)
  }
  const addScore = (side: TeamSide, playerId: string, kind: ScoreKind, shot?: ShotSpot) => addEvent({ type: 'SCORE', team: side, playerId, kind, shot, period: ls.period, gameClock: 0 })
  const addFoul = (side: TeamSide, playerId: string) => addEvent({ type: 'FOUL', team: side, target: { kind: 'player', playerId }, foulType: 'personal', period: ls.period, gameClock: 0 })
  const addStat = (side: TeamSide, playerId: string, stat: StatKind) => addEvent({ type: 'STAT', team: side, playerId, stat, period: ls.period, gameClock: 0 })
  const addMiss = (side: TeamSide, playerId: string, kind: ScoreKind, shot: ShotSpot) => addEvent({ type: 'MISS', team: side, playerId, kind, shot, period: ls.period, gameClock: 0 })
  const removeMiss = (side: TeamSide, id: string) => removeLast((e) => e.type === 'MISS' && e.team === side && e.playerId === id)
  const missesOf = (side: TeamSide, id: string) => match.events.filter((e) => e.type === 'MISS' && e.team === side && e.playerId === id).length
  const removeScoreKind = (side: TeamSide, id: string, kind: ScoreKind) => removeLast((e) => e.type === 'SCORE' && e.team === side && e.playerId === id && e.kind === kind)
  const removeFoul = (side: TeamSide, id: string) => removeLast((e) => e.type === 'FOUL' && e.team === side && e.target.kind === 'player' && e.target.playerId === id)
  const removeStatKind = (side: TeamSide, id: string, stat: StatKind) => removeLast((e) => e.type === 'STAT' && e.team === side && e.playerId === id && e.stat === stat)
  const scoreCountsOf = (side: TeamSide, id: string): Record<ScoreKind, number> => {
    const c: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
    for (const e of match.events) if (e.type === 'SCORE' && e.team === side && e.playerId === id) c[e.kind]++
    return c
  }
  const statCountsOf = (side: TeamSide, id: string): Record<StatKind, number> => {
    const c: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }
    for (const e of match.events) if (e.type === 'STAT' && e.team === side && e.playerId === id) c[e.stat]++
    return c
  }
  const foulsOf = (side: TeamSide, id: string) => playerStats(match, side).find((s) => s.playerId === id)?.fouls ?? 0
  const pickTeamId = pick ? (pick.side === 'A' ? meta.teamAId : meta.teamBId) : ''

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onHome} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>← Accueil</button>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`/match/${match.id}/watch`} target="_blank" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.muted }}>👁 Suivi</Link>
          <button onClick={() => guard(() => setShowEdit(true))} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>✎ Infos</button>
          <button onClick={() => (editStats ? setEditStats(false) : guard(() => setEditStats(true)))}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={editStats ? { background: C.accent, color: '#fff' } : { border: bd, color: C.text }}>
            {editStats ? '✓ Terminer' : '✎ Corriger stats'}
          </button>
          <button onClick={printSummary} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>⬇ Exporter en PDF</button>
        </div>
      </div>
      {editStats && (
        <div className="mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}44` }}>
          Mode correction — cliquez un joueur dans un tableau pour ajuster ses points, fautes ou stats.
        </div>
      )}
      <MatchMetaDialog open={showEdit} meta={match.meta} onClose={() => setShowEdit(false)} onSave={saveMeta} />
      <PlayerActionDialog
        open={!!pick} playerName={pick?.name ?? ''} color={pickTeamId ? teamColor(pickTeamId) : '#ffffff'}
        scoreCounts={pick ? scoreCountsOf(pick.side, pick.id) : undefined}
        statCounts={pick ? statCountsOf(pick.side, pick.id) : undefined}
        fouls={pick ? foulsOf(pick.side, pick.id) : 0}
        shots={pick ? shotsOf([match], pick.id) : undefined}
        onClose={() => setPick(null)}
        onScore={(k, shot) => pick && addScore(pick.side, pick.id, k, shot)}
        onFoul={() => pick && addFoul(pick.side, pick.id)}
        onStat={(k) => pick && addStat(pick.side, pick.id, k)}
        onRemoveScore={(k) => pick && removeScoreKind(pick.side, pick.id, k)}
        onRemoveFoul={() => pick && removeFoul(pick.side, pick.id)}
        onRemoveStat={(k) => pick && removeStatKind(pick.side, pick.id, k)}
        misses={pick ? missesOf(pick.side, pick.id) : 0}
        onMiss={(k, shot) => pick && addMiss(pick.side, pick.id, k, shot)}
        onRemoveMiss={() => pick && removeMiss(pick.side, pick.id)}
      />

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
        <TeamTable match={match} side="A" players={players} name={teamNames.A} teamId={meta.teamAId}
          onPick={editStats ? (id, label) => setPick({ side: 'A', id, name: label }) : undefined} />
        <OpponentCard teamId={meta.teamBId} name={teamNames.B} score={score.b} />
      </div>

      {/* INDICATEURS */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Plus large écart" a={ratios.A.maxLead} b={ratios.B.maxLead} />
        <Stat label="Plus longue série" a={ratios.A.maxRun} b={ratios.B.maxRun} />
        <Stat label="Points du banc" a={teamTotals(match, 'A').bench.points} b="—" />
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

/** L'adversaire n'a pas d'effectif : un tableau de stats joueur y afficherait un
 *  total à 0 sous un score qui, lui, est réel. On affiche donc à la place ce
 *  score (indépendant du roster) avec la mention explicite que la saisie était
 *  globale, plutôt qu'un silence trompeur. */
function OpponentCard({ teamId, name, score }: { teamId: string; name: string; score: number }) {
  return (
    <section className="flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-4" style={{ background: C.card, border: bd }}>
      <TeamBadge id={teamId} name={name} size="h-11 w-11 text-xs" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-extrabold uppercase tracking-wide">Visiteurs · {name}</h3>
        <p className="mt-0.5 text-[11px] font-semibold" style={{ color: C.faint }}>Score saisi globalement — pas de détail joueur en mode « une seule équipe ».</p>
      </div>
      <span className="text-3xl font-black tabular-nums" style={{ color: teamColor(teamId) }}>{score}</span>
    </section>
  )
}

function TeamTable({ match, side, players, name, teamId, onPick }: { match: Match; side: TeamSide; players: Record<string, Player>; name: string; teamId: string; onPick?: (playerId: string, label: string) => void }) {
  const stats = playerStats(match, side)
  const times = playingTimes(match, side)
  const totals = teamTotals(match, side)
  // Avant cette branche, l'évènement MISS n'existait pas : sur ces rencontres (et sur
  // toute nouvelle rencontre où « Manqué » n'a jamais été utilisé), le dénominateur
  // fieldGoalsMade + misses vaut toujours fieldGoalsMade, donc chaque marqueur afficherait
  // à tort 100 %. On n'affiche le pourcentage que si ce côté a suivi au moins un tir manqué.
  const tracksMisses = match.events.some((e) => e.type === 'MISS' && e.team === side)
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: bd, ...(onPick ? { boxShadow: `0 0 0 1px ${C.accent}55` } : {}) }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(teamId) }} />
        <h3 className="text-sm font-extrabold uppercase tracking-wide">{side === 'A' ? 'Locaux' : 'Visiteurs'} · {name}</h3>
        {onPick && <span className="ml-auto text-[11px] font-bold" style={{ color: C.accent }}>✎ cliquez une ligne</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase" style={{ color: C.faint }}>
              <Th left>N°</Th><Th left>Joueur</Th><Th>5</Th><Th>Tps</Th><Th>Pts</Th><Th>Tirs</Th><Th>%Tirs</Th><Th>3pts</Th><Th>2 Int</Th><Th>2 Ext</Th><Th>LF</Th><Th>PD</Th><Th>RO</Th><Th>RD</Th><Th>CT</Th><Th>Ftes</Th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const p = players[s.playerId]
              const dnp = (times.get(s.playerId) ?? 0) === 0 && s.points === 0 && s.fouls === 0
              return (
                <tr key={s.playerId} onClick={onPick ? () => onPick(s.playerId, `${p?.number ?? ''} ${p?.lastName ?? ''}`.trim()) : undefined}
                  className={onPick ? 'cursor-pointer transition hover:bg-white/[0.04]' : ''}
                  style={{ borderTop: `1px solid ${C.border}`, opacity: dnp && !onPick ? 0.5 : 1 }}>
                  <Td left><span className="font-black">{p?.number ?? '—'}</span></Td>
                  <Td left>{p ? <Link to={`/players/${s.playerId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{p.lastName} {p.firstName}</Link> : s.playerId}</Td>
                  <Td>{s.isStarter ? '●' : ''}</Td>
                  <Td>{fmt(times.get(s.playerId) ?? 0)}</Td>
                  <Td><span className="font-black" style={{ color: s.points > 0 ? C.text : C.faint }}>{s.points}</span></Td>
                  <Td>{s.fieldGoalsMade}</Td>
                  <Td>{tracksMisses && s.fieldGoalsMade + s.misses > 0 ? `${Math.round((s.fieldGoalsMade / (s.fieldGoalsMade + s.misses)) * 100)} %` : '—'}</Td>
                  <Td>{s.threes}</Td><Td>{s.twoInside}</Td><Td>{s.twoOutside}</Td><Td>{s.freeThrows}</Td>
                  <Td>{s.assists}</Td><Td>{s.offRebounds}</Td><Td>{s.defRebounds}</Td><Td>{s.blocks}</Td>
                  <Td><span style={{ color: s.fouls >= 5 ? C.pink : undefined }}>{s.fouls}</span></Td>
                </tr>
              )
            })}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
              <Td left></Td><Td left><span className="font-black uppercase text-[12px]">Total équipe</span></Td><Td></Td><Td></Td>
              <Td><span className="font-black" style={{ color: teamColor(teamId) }}>{totals.team.points}</span></Td>
              <Td><b>{totals.team.fieldGoalsMade}</b></Td><Td></Td><Td><b>{totals.team.threes}</b></Td><Td><b>{totals.team.twoInside}</b></Td><Td><b>{totals.team.twoOutside}</b></Td><Td><b>{totals.team.freeThrows}</b></Td>
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
