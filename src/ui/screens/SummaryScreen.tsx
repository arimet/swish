import { useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PrintableSummary } from '../../export/PrintableSummary'
import { ProgressionChart } from '../../export/ProgressionChart'
import { printSummary } from '../../export/print'
import { MatchMetaDialog } from '../components/MatchMetaDialog'
import { PlayerActionDialog } from '../components/PlayerActionDialog'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { saveMatch } from '../../persistence/repositories'
import { docKey, useMatchDoc, usePlayersById, useTeamsById } from '../../persistence/queries'
import { removeLastEvent } from '../../domain/reducer'
import { newId } from '../../domain/ids'
import { liveState } from '../../rules/ffbb'
import { playerStats, type PlayerStat } from '../../domain/boxscore'
import { setCount, type Cell } from '../../domain/correct'
import { shotsOf } from '../../domain/shotchart'
import { playingTimes } from '../../domain/playingtime'
import { teamTotals } from '../../domain/totals'
import { matchRatios, scoreProgression } from '../../domain/progression'
import { fmt } from '../components/GameClock'
import { C, bd, TeamBadge, fmtDate , useLeagueLabel } from '../olive/kit'
import type { GameEvent, Match, Player, ScoreKind, ShotSpot, StatKind, TeamSide } from '../../domain/types'
import { Check, Download, Eye, Pencil } from 'lucide-react'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<GameEvent, 'id' | 'wallClock'>

export function SummaryScreen({ matchId, onHome }: { matchId: string; onHome: () => void }) {
  const translate = useT()
  const champ = useLeagueLabel()
  const { can, guard } = useAuth()
  const client = useQueryClient()
  const { data: match } = useMatchDoc(matchId)
  const { data: players = {} } = usePlayersById(match?.meta.clubId)
  const { data: byId = {} } = useTeamsById()
  // Indexed by event side: A = our club, B = the opposition (with no roster).
  const teamNames: Record<TeamSide, string> = {
    A: byId[match?.meta.clubId ?? '']?.name ?? translate('common.ourTeam'),
    B: byId[match?.meta.opponentId ?? '']?.name ?? translate('match.opponent'),
  }
  const [showEdit, setShowEdit] = useState(false)
  const [editStats, setEditStats] = useState(false)
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null)


  if (match === undefined) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (match === null) return <div className="p-6"><p className="py-16 text-center text-sm" style={{ color: C.muted }}>{translate('preview.notFound')}</p></div>

  const ls = liveState(match)
  const score = ls.score
  const ratios = matchRatios(match)
  const f = fmtDate(match.meta.date)
  const meta = match.meta

  /* The cache is the sheet, here as in `useMatch`: the correction shows at once and the
     write follows. No rollback on this screen — a stat corrected after the game is not
     a basket during one, and the `ConnectionState` pill carries a failed write. */
  const persist = async (next: Match) => {
    client.setQueryData(docKey('match', matchId), next)
    await saveMatch(next)
  }
  const saveMeta = async (patch: Partial<Match['meta']>) => persist({ ...match, meta: { ...match.meta, ...patch } })

  // Correcting stats after the game (admin only): we add and remove events.
  const addEvent = (e: EventInput) =>
    persist({ ...match, events: [...match.events, { ...e, id: newId(), wallClock: Date.now() } as GameEvent] })
  const removeLast = (pred: (e: GameEvent) => boolean) => {
    const next = removeLastEvent(match, pred)
    if (next !== match) persist(next)
  }
  // Stats correction only touches our roster (side A): the opposition has no players
  // recorded.
  const addScore = (playerId: string, kind: ScoreKind, shot?: ShotSpot) => addEvent({ type: 'SCORE', team: 'A', playerId, kind, shot, period: ls.period, gameClock: 0 })
  const addFoul = (playerId: string) => addEvent({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId }, foulType: 'personal', period: ls.period, gameClock: 0 })
  const addStat = (playerId: string, stat: StatKind) => addEvent({ type: 'STAT', team: 'A', playerId, stat, period: ls.period, gameClock: 0 })
  const addMiss = (playerId: string, kind: ScoreKind, shot: ShotSpot) => addEvent({ type: 'MISS', team: 'A', playerId, kind, shot, period: ls.period, gameClock: 0 })
  const removeMiss = (id: string) => removeLast((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === id)
  const missesOf = (id: string) => match.events.filter((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === id).length
  const removeScoreKind = (id: string, kind: ScoreKind) => removeLast((e) => e.type === 'SCORE' && e.team === 'A' && e.playerId === id && e.kind === kind)
  const removeFoul = (id: string) => removeLast((e) => e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player' && e.target.playerId === id)
  const removeStatKind = (id: string, stat: StatKind) => removeLast((e) => e.type === 'STAT' && e.team === 'A' && e.playerId === id && e.stat === stat)
  const scoreCountsOf = (id: string): Record<ScoreKind, number> => {
    const c: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
    for (const e of match.events) if (e.type === 'SCORE' && e.team === 'A' && e.playerId === id) c[e.kind]++
    return c
  }
  const statCountsOf = (id: string): Record<StatKind, number> => {
    const c: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }
    for (const e of match.events) if (e.type === 'STAT' && e.team === 'A' && e.playerId === id) c[e.stat]++
    return c
  }
  const foulsOf = (id: string) => playerStats(match).find((s) => s.playerId === id)?.fouls ?? 0
  /* Typing a number into a cell: the domain turns it back into the events that add up
     to it, in one write. See `domain/correct`. */
  const setCell = (playerId: string, cell: Cell, n: number) => {
    const next = setCount(match, playerId, cell, n, ls.period)
    if (next !== match) persist(next)
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onHome} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>{translate('gate.home')}</button>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`/match/${match.id}/watch`} target="_blank" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.muted }}><Eye className="h-4 w-4" strokeWidth={2} />{translate('summary.spectatorView')}</Link>
          {/* Correcting the details or the stats after the fact belongs to
              administration: both buttons render only for it. Reading the sheet,
              following it and exporting it stay ungated for everyone. */}
          {can('manage') && (
            <>
              <button onClick={() => guard('manage', () => setShowEdit(true))} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}><Pencil className="h-4 w-4" strokeWidth={2} />{translate('summary.details')}</button>
              {/* The right is checked when correction mode opens, not re-derived
                  afterwards: an administrator who opens "Correct stats" and then locks
                  themselves out keeps a writing correction mode until they leave it.
                  That is accepted — you would have to hand the tablet over mid-correction
                  for it to matter. `LiveMatch` re-evaluates `can()` on every render
                  because recording a game lasts two hours and changes hands, not because
                  this screen forgot to. */}
              <button onClick={() => (editStats ? setEditStats(false) : guard('manage', () => setEditStats(true)))}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold" style={editStats ? { background: C.brand, color: C.onBrand } : { border: bd, color: C.text }}>
                {editStats
                  ? <><Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('summary.done')}</>
                  : <><Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />{translate('summary.correctStats')}</>}
              </button>
            </>
          )}
          <button onClick={printSummary} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}><Download className="h-4 w-4" strokeWidth={2} />{translate('summary.exportPdf')}</button>
        </div>
      </div>
      {editStats && (
        <div className="mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBd}` }}>
          {translate('summary.correctionMode')}
        </div>
      )}
      <MatchMetaDialog open={showEdit} meta={match.meta} onClose={() => setShowEdit(false)} onSave={saveMeta} />
      <PlayerActionDialog
        open={!!pick} playerName={pick?.name ?? ''} color={C.brand}
        scoreCounts={pick ? scoreCountsOf(pick.id) : undefined}
        statCounts={pick ? statCountsOf(pick.id) : undefined}
        fouls={pick ? foulsOf(pick.id) : 0}
        shots={pick ? shotsOf([match], pick.id) : undefined}
        onClose={() => setPick(null)}
        onScore={(k, shot) => pick && addScore(pick.id, k, shot)}
        onFoul={() => pick && addFoul(pick.id)}
        onStat={(k) => pick && addStat(pick.id, k)}
        onRemoveScore={(k) => pick && removeScoreKind(pick.id, k)}
        onRemoveFoul={() => pick && removeFoul(pick.id)}
        onRemoveStat={(k) => pick && removeStatKind(pick.id, k)}
        misses={pick ? missesOf(pick.id) : 0}
        onMiss={(k, shot) => pick && addMiss(pick.id, k, shot)}
        onRemoveMiss={() => pick && removeMiss(pick.id)}
      />

      {/* FINAL SCOREBOARD */}
      <div className="overflow-hidden rounded-3xl" style={{ background: C.frame, border: bd }}>
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="truncate text-[12px] font-bold" style={{ color: C.muted }}>{champ(meta)}</span>
          <span className="rounded-md px-2 py-0.5 text-[12px] font-black uppercase" style={{ background: C.neutralBg, color: C.muted }}>{translate('summary.final')}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-5 sm:gap-8">
          <FinalSide id={meta.clubId} name={teamNames.A} score={score.a} win={score.a >= score.b} align="right" />
          <span className="text-lg font-black" style={{ color: C.faint }}>–</span>
          <FinalSide id={meta.opponentId} name={teamNames.B} score={score.b} win={score.b > score.a} align="left" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t px-6 py-3 text-[12px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
          {meta.matchNumber && <span>{translate('preview.gameNumber', { n: meta.matchNumber })}</span>}
          {f.long && <span className="capitalize">{f.long}</span>}
          {meta.venue && <span>{meta.venue}</span>}
          {(meta.referee1 || meta.referee2) && <span>{translate('print.referees')} · {[meta.referee1, meta.referee2].filter(Boolean).join(', ')}</span>}
        </div>
      </div>

      {/* PER-TEAM TABLES */}
      <div className="mt-6 space-y-6">
        <TeamTable match={match} players={players} name={teamNames.A}
          onPick={editStats ? (id, label) => setPick({ id, name: label }) : undefined}
          onSet={editStats ? setCell : undefined} />
        <OpponentCard teamId={meta.opponentId} name={teamNames.B} score={score.b} />
      </div>

      {/* INDICATORS */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label={translate('summary.largestLead')} a={ratios.A.maxLead} b={ratios.B.maxLead} />
        <Stat label={translate('summary.longestRun')} a={ratios.A.maxRun} b={ratios.B.maxRun} />
        <Stat label={translate('summary.benchPoints')} a={teamTotals(match).bench.points} b="—" />
        <Stat label={translate('summary.timeInFront')} a={fmt(ratios.A.leadDurationSec)} b={fmt(ratios.B.leadDurationSec)} />
        <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
          <p className="text-[12px] font-bold tracking-wide" style={{ color: C.faint }}>{translate('summary.ties')}</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{ratios.ties}</p>
        </div>
      </div>

      {/* PROGRESSION */}
      <section className="mt-6 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('summary.progression')}</p>
          <span className="flex items-center gap-4 text-xs font-bold">
            {/* Two series, so two colours from the charter and not two hashes: a
                one-pixel line in dark navy was invisible on the dark card, and nothing
                guaranteed the two hashes would land on separable hues. Lemon and blue
                are distinct in both themes, and the dashes keep saying "the opposition"
                without the colour. */}
            <span className="flex items-center gap-2"><span className="h-1 w-6 rounded-full" style={{ background: C.brand }} /><span style={{ color: C.text }}>{teamNames.A}</span></span>
            <span className="flex items-center gap-2"><span className="h-1 w-6 rounded-full" style={{ backgroundImage: `repeating-linear-gradient(90deg, ${C.infoFill} 0 5px, transparent 5px 8px)` }} /><span style={{ color: C.text }}>{teamNames.B}</span></span>
          </span>
        </div>
        <div className="overflow-x-auto" style={{ color: C.muted }}>
          <ProgressionChart points={scoreProgression(match)} colorA={C.brand} colorB={C.infoFill} />
        </div>
      </section>

      {/* The printable sheet (hidden on screen, visible when printing) */}
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
        {/* The winner in accent, the loser in grey. `teamColor(id)` drew the colour
            from a hash among eight NBA-ish hex values: right for a crest in a list,
            wrong for a sixty-pixel number, and both the navy and the crimson fell to
            2.1:1 on the dark card. The crest just to the left keeps its club colour —
            that is where identity means something. Here the question is "who won", and
            a single accent answers it. */}
        <p className="text-5xl font-black tabular-nums sm:text-6xl" style={{ color: win ? C.accent : C.muted }}>{score}</p>
      </div>
    </div>
  )
}

function Stat({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-lg font-black tabular-nums">
        <span>{a}</span><span className="text-xs font-bold" style={{ color: C.faint }}>/</span><span>{b}</span>
      </p>
    </div>
  )
}

/** The opposition has no roster: a player stats table would show a total of 0 under
 *  a score that is real. So we show that score instead (independent of the roster)
 *  with an explicit note that it was entered as a total, rather than a misleading
 *  silence. */
function OpponentCard({ teamId, name, score }: { teamId: string; name: string; score: number }) {
  const translate = useT()
  return (
    <section className="flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-4" style={{ background: C.card, border: bd }}>
      <TeamBadge id={teamId} name={name} size="h-11 w-11 text-xs" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-extrabold uppercase tracking-wide">{translate('summary.away', { name: name })}</h3>
        <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.faint }}>{translate('summary.totalScore')}</p>
      </div>
      <span className="text-3xl font-black tabular-nums" style={{ color: C.accent }}>{score}</span>
    </section>
  )
}

/**
 * The columns a number can be typed into, in the order they stand in the table.
 *
 * Only the raw counters. Points, field goals and the percentage are read off these —
 * offering them for edit would offer two ways to say the same thing and no way to say
 * which one won. They recompute under the eye as soon as a counter is corrected, which
 * is the whole point of leaving them alone.
 */
const EDITABLE: { cell: Cell; label: string; read: (s: PlayerStat) => number }[] = [
  { cell: '3', label: 'summary.th3pt', read: (s) => s.threes },
  { cell: '2int', label: 'summary.th2in', read: (s) => s.twoInside },
  { cell: '2ext', label: 'summary.th2out', read: (s) => s.twoOutside },
  { cell: 'lf', label: 'summary.thFt', read: (s) => s.freeThrows },
  { cell: 'assist', label: 'summary.thAst', read: (s) => s.assists },
  { cell: 'reb_off', label: 'summary.thOreb', read: (s) => s.offRebounds },
  { cell: 'reb_def', label: 'summary.thDreb', read: (s) => s.defRebounds },
  { cell: 'block', label: 'summary.thBlk', read: (s) => s.blocks },
  { cell: 'foul', label: 'summary.thPf', read: (s) => s.fouls },
]

/* `teamId` has gone from the signature: it only served `teamColor` there, and leaving
   a parameter nothing reads invites the next person to believe it matters. */
function TeamTable({ match, players, name, onPick, onSet }: {
  match: Match; players: Record<string, Player>; name: string
  onPick?: (playerId: string, label: string) => void
  onSet?: (playerId: string, cell: Cell, n: number) => void
}) {
  const translate = useT()
  const stats = playerStats(match)
  const times = playingTimes(match)
  const totals = teamTotals(match)
  /* The sheet is a grid, so it is walked like one: the cells carry their coordinates
     and the move goes looking for the neighbour by them. Nothing is remembered — the
     DOM already holds where every cell is, and a parallel map of refs would only be a
     second version of it to keep in step. */
  const grid = useRef<HTMLTableSectionElement>(null)
  const move = (row: number, col: number) => {
    const next = grid.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)
    next?.focus()
    next?.select()
  }
  // Before this branch the MISS event did not exist: on those games (and on any new
  // game where "Missed" was never used), the denominator fieldGoalsMade + misses is
  // always fieldGoalsMade, so every scorer would wrongly show 100%. We only show the
  // percentage if our club tracked at least one missed shot.
  const tracksMisses = match.events.some((e) => e.type === 'MISS' && e.team === 'A')
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: bd, ...(onPick ? { boxShadow: `0 0 0 1px ${C.accentBd}` } : {}) }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.brand }} />
        <h3 className="text-sm font-extrabold uppercase tracking-wide">{translate('summary.home', { name: name })}</h3>
        {onPick && <span className="ml-auto text-[12px] font-bold" style={{ color: C.accent }}><Pencil className="mr-1 inline h-3 w-3 align-[-1px]" strokeWidth={2} />{translate('summary.clickARow')}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[12px] font-bold uppercase" style={{ color: C.faint }}>
              <Th left>{translate('team.number')}</Th><Th left>{translate('summary.thPlayer')}</Th><Th>5</Th><Th>{translate('summary.thTime')}</Th><Th>{translate('summary.thPts')}</Th><Th>{translate('summary.thFg')}</Th><Th>{translate('summary.thFgPct')}</Th><Th>{translate('summary.th3pt')}</Th><Th>{translate('summary.th2in')}</Th><Th>{translate('summary.th2out')}</Th><Th>{translate('summary.thFt')}</Th><Th>{translate('summary.thAst')}</Th><Th>{translate('summary.thOreb')}</Th><Th>{translate('summary.thDreb')}</Th><Th>{translate('summary.thBlk')}</Th><Th>{translate('summary.thPf')}</Th>
            </tr>
          </thead>
          <tbody ref={grid}>
            {stats.map((s, row) => {
              const p = players[s.playerId]
              const dnp = (times.get(s.playerId) ?? 0) === 0 && s.points === 0 && s.fouls === 0
              const who = `${p?.number ?? ''} ${p?.lastName ?? ''}`.trim() || s.playerId
              return (
                <tr key={s.playerId} onClick={onPick ? () => onPick(s.playerId, who) : undefined}
                  className={onPick ? 'cursor-pointer transition hover:bg-[var(--c-hover)]' : ''}
                  style={{ borderTop: `1px solid ${C.border}`, opacity: dnp && !onPick ? 0.5 : 1 }}>
                  <Td left><span className="font-black">{p?.number ?? '—'}</span></Td>
                  <Td left>{p ? <Link to={`/players/${s.playerId}`} onClick={(e) => e.stopPropagation()} className="-my-1 inline-block py-1.5 hover:underline">{p.lastName} {p.firstName}</Link> : s.playerId}</Td>
                  <Td>{s.isStarter ? '●' : ''}</Td>
                  <Td>{fmt(times.get(s.playerId) ?? 0)}</Td>
                  <Td><span className="font-black" style={{ color: s.points > 0 ? C.text : C.faint }}>{s.points}</span></Td>
                  <Td>{s.fieldGoalsMade}</Td>
                  <Td>{tracksMisses && s.fieldGoalsMade + s.misses > 0 ? `${Math.round((s.fieldGoalsMade / (s.fieldGoalsMade + s.misses)) * 100)} %` : '—'}</Td>
                  {EDITABLE.map((column, col) => (
                    <Td key={column.cell} tight={!!onSet}>
                      {onSet
                        ? <StatCell
                            row={row} col={col} value={column.read(s)}
                            label={translate('summary.cell', { stat: translate(column.label), player: who })}
                            onCommit={(n) => onSet(s.playerId, column.cell, n)} onMove={move}
                          />
                        : <span style={column.cell === 'foul' && s.fouls >= 5 ? { color: C.accent } : undefined}>{column.read(s)}</span>}
                    </Td>
                  ))}
                </tr>
              )
            })}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
              <Td left></Td><Td left><span className="font-black uppercase text-[12px]">{translate('summary.teamTotal')}</span></Td><Td></Td><Td></Td>
              <Td><span className="font-black" style={{ color: C.accent }}>{totals.team.points}</span></Td>
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
/** `tight` is for the cells that hold an input: the box already draws its own edges,
 *  and the reading gutter on top of it pushed the sheet's nine editable columns wide
 *  enough to squeeze the name and the percentage into two lines each. */
function Td({ children, left, tight }: { children?: ReactNode; left?: boolean; tight?: boolean }) {
  return <td className={`py-2.5 tabular-nums ${tight ? 'px-1' : 'px-3'} ${left ? 'text-left' : 'text-center'}`} style={{ color: C.muted }}>{children}</td>
}

/**
 * One cell of the sheet, typed into like a spreadsheet's.
 *
 * The keys are the ones a hand already knows there: Enter and the arrows walk the
 * grid, Tab follows the DOM's order, Escape gives up on what was being typed. The
 * content is selected on focus, so landing on a cell and typing replaces it — nobody
 * corrects "12" into "3" by deleting two characters first.
 *
 * The value is written on the way out (blur, Enter, an arrow), never on the keystroke:
 * committing as you type would make "12" pass through "1", and one instant of a row
 * showing a wrong total is one instant too many on a sheet meant to be trusted.
 */
function StatCell({ row, col, value, label, onCommit, onMove }: {
  row: number; col: number; value: number; label: string
  onCommit: (n: number) => void; onMove: (row: number, col: number) => void
}) {
  // `null` means "showing the sheet's value"; a string means "being typed into". The
  // two must not be conflated: an empty string is a cell someone is clearing.
  //
  // The draft is held in a ref as well as in state, and the ref is what `commit` reads.
  // Giving up (Escape) clears the draft and blurs in the same breath, and blur commits:
  // reading the state there would read the render's value — the one just abandoned —
  // and write it. Escape used to save what it was cancelling.
  const [draft, setDraft] = useState<string | null>(null)
  const typing = useRef<string | null>(null)
  const set = (v: string | null) => { typing.current = v; setDraft(v) }
  const commit = () => {
    const d = typing.current
    if (d === null) return
    set(null)
    const n = Number(d)
    if (d !== '' && n !== value) onCommit(n)
  }
  const WALK: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  }
  return (
    <input
      data-cell={`${row}:${col}`} aria-label={label} value={draft ?? String(value)}
      inputMode="numeric" autoComplete="off"
      // Digits only: the column counts baskets. A filter is kinder than a rejection
      // after the fact — the wrong character never lands.
      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      onFocus={(e) => e.currentTarget.select()}
      // The row underneath opens the shot dialog; aiming at a cell is not aiming at
      // the row.
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { set(null); e.currentTarget.blur(); return }
        const step = WALK[e.key]
        if (!step) return
        e.preventDefault()
        commit()
        onMove(row + step[0], col + step[1])
      }}
      className="h-9 w-12 rounded-md text-center text-sm font-bold tabular-nums outline-none focus:ring-2"
      style={{ background: C.panel, border: bd, color: C.text, ['--tw-ring-color' as string]: C.accent }}
    />
  )
}
