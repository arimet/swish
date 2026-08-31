import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GameClock } from '../components/GameClock'
import { TeamPanel } from '../components/TeamPanel'
import { PlayerActionDialog } from '../components/PlayerActionDialog'
import { ClockEditDialog } from '../components/ClockEditDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StartingFiveGate } from '../components/StartingFiveGate'
import { AccessGate } from '../components/AccessGate'
import { SubstitutionDialog } from '../components/SubstitutionDialog'
import { ClockAdjust, PeriodStrip, ScoreSide, SbButton } from '../components/Scoreboard'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { ConnectionState } from '../components/ConnectionState'
import { useAuth } from '../../app/auth'
import { useMatch } from '../../app/useMatch'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { shotsOf } from '../../domain/shotchart'
import { usePlayersById, useTeamsById } from '../../persistence/queries'
import { periodLength, seedSeconds } from '../../domain/ids'
import type { Match, Player, ScoreKind, ShotSpot, StatKind, FoulType } from '../../domain/types'
import { Eye, Pencil, RotateCcw, X } from 'lucide-react'

/* Our team's accent, and it is the brand — not a separate `--team-a` token. That
   one was a near-black in the light theme, which gave the roster panel a black top
   rule, black rings around the numbers and black dots: nothing that resembled the
   rest of the application. Only one team is detailed on this screen, so "our colour"
   and "the product's colour" are the same thing and have no business being two
   tokens. */
const TEAM_A = C.brand
const OPP_POINTS: { k: ScoreKind; n: number }[] = [{ k: 'lf', n: 1 }, { k: '2int', n: 2 }, { k: '3', n: 3 }]

/**
 * The game's scorer's table: our roster is detailed player by player, the opposition
 * comes down to a score entered as a total.
 */
export function LiveMatch({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const translate = useT()
  const navigate = useNavigate()
  const { can, guard } = useAuth()
  const { match, dispatch, dispatchMany, undo, removeLast, finish, error } = useMatch(matchId)
  const [askFinish, setAskFinish] = useState(false)
  const { data: players = {} } = usePlayersById(match?.meta.clubId)
  const { data: byId = {} } = useTeamsById()
  const teamNames = {
    A: byId[match?.meta.clubId ?? '']?.name ?? translate('nav.myTeam'),
    B: byId[match?.meta.opponentId ?? '']?.name ?? translate('match.opponent'),
  }
  const [seconds, setSeconds] = useState(600)
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null)
  const [starters, setStarters] = useState<string[]>([])
  const [sub, setSub] = useState(false)
  const [editClock, setEditClock] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const seededMatchId = useRef<string | null>(null)

  const ls = match ? liveState(match) : null


  useEffect(() => {
    if (!match || !ls || seededMatchId.current === match.id) return
    seededMatchId.current = match.id
    setSeconds(seedSeconds(match, ls.period))
  }, [match, ls])

  useEffect(() => {
    if (ls?.clockRunning) {
      timer.current = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
      return () => clearInterval(timer.current)
    }
  }, [ls?.clockRunning])

  if (!match || !ls)
    return <div className="grid min-h-dvh place-items-center text-muted-foreground">{translate('common.loading')}</div>

  if (!can('score'))
    return <AccessGate ability="score" matchId={matchId} onUnlock={() => guard('score', () => {})} onExit={() => navigate('/')} />

  const rosterPlayers = match.roster.map((id) => players[id]).filter(Boolean)

  if (!match.events.some((e) => e.type === 'STARTING_FIVE' && e.team === 'A')) {
    const required = Math.min(5, match.roster.length)
    const toggle = (id: string) =>
      setStarters((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= required ? cur : [...cur, id]))
    const byNumber = (ids: string[]) => [...ids].sort((a, b) => (players[a]?.number ?? 0) - (players[b]?.number ?? 0))
    return (
      <StartingFiveGate
        rosterA={rosterPlayers} requiredA={required}
        selected={starters} onToggle={toggle}
        canStart={starters.length === required}
        onStart={() => dispatch({ type: 'STARTING_FIVE', team: 'A', playerIds: byNumber(starters), period: ls.period, gameClock: periodLength(ls.period) })}
        onExit={() => navigate('/')}
      />
    )
  }

  const toggleClock = () =>
    dispatch({ type: ls.clockRunning ? 'CLOCK_STOP' : 'CLOCK_START', period: ls.period, gameClock: seconds })

  const statsByPlayer = () => {
    const map = new Map<string, { points: number; fouls: number }>()
    for (const s of playerStats(match)) map.set(s.playerId, { points: s.points, fouls: s.fouls })
    return map
  }
  const score = (kind: ScoreKind, shot?: ShotSpot) => pick &&
    dispatch({ type: 'SCORE', team: 'A', playerId: pick.id, kind, shot, period: ls.period, gameClock: seconds })
  const miss = (kind: ScoreKind, shot: ShotSpot) => pick &&
    dispatch({ type: 'MISS', team: 'A', playerId: pick.id, kind, shot, period: ls.period, gameClock: seconds })
  const foul = (type: FoulType) => pick &&
    dispatch({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: pick.id }, foulType: type, period: ls.period, gameClock: seconds })

  // An opposition basket: no player named, only the score counts.
  const oppScore = (kind: ScoreKind) =>
    dispatch({ type: 'SCORE', team: 'B', kind, period: ls.period, gameClock: seconds })
  const removeOppScore = () =>
    removeLast((e) => e.type === 'SCORE' && e.team === 'B' && !e.playerId)

  const countOf = <T extends string>(keys: T[], read: (e: Match['events'][number]) => T | null): Record<T, number> => {
    const c = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>
    for (const e of match.events) { const k = read(e); if (k) c[k]++ }
    return c
  }
  const scoreCounts = (id: string) =>
    countOf<ScoreKind>(['2int', '2ext', '3', 'lf'], (e) =>
      e.type === 'SCORE' && e.team === 'A' && e.playerId === id ? e.kind : null)
  const statCounts = (id: string) =>
    countOf<StatKind>(['assist', 'reb_off', 'reb_def', 'block'], (e) =>
      e.type === 'STAT' && e.team === 'A' && e.playerId === id ? e.stat : null)
  const missCount = (id: string) =>
    match.events.filter((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === id).length
  /** This player's fouls, by type. Only the types actually recorded appear, so the
   *  corrections can name what they will take back. */
  const foulCounts = (id: string): Partial<Record<FoulType, number>> => {
    const c: Partial<Record<FoulType, number>> = {}
    for (const e of match.events)
      if (e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player' && e.target.playerId === id)
        c[e.foulType] = (c[e.foulType] ?? 0) + 1
    return c
  }

  const clampClock = (s: number) => Math.min(periodLength(ls.period), Math.max(0, s))
  const onCourt = () => {
    const byId = new Map(rosterPlayers.map((p) => [p.id, p]))
    return ls.onCourt.A.map((id) => byId.get(id)).filter((p): p is Player => !!p)
  }
  const bench = () => {
    const on = new Set(ls.onCourt.A), out = new Set(ls.fouledOut.A)
    return rosterPlayers.filter((p) => !on.has(p.id) && !out.has(p.id))
  }

  const nextPeriod = () => {
    const next = ls.period + 1
    dispatchMany([
      { type: 'PERIOD_END', period: ls.period, gameClock: seconds },
      { type: 'PERIOD_START', period: next, gameClock: periodLength(next) },
    ])
    setSeconds(periodLength(next))
  }

  return (
    /* `h-dvh`, not `min-h-full`: the scoreboard and the clock must never scroll off
       the screen — only the roster scrolls. This screen sits outside the shell, which
       is what leaves the roster the hundred pixels it needs. */
    <div className="flex h-dvh flex-col overflow-hidden" style={{ background: C.frame, color: C.text }}>
      {/* The banner is a card, and takes its colours from the theme like everything
          else: a hard-coded charcoal would lay a black rectangle at the top of a light
          application. It holds its presence through the plane — the card is the high
          point — and through the rule separating it from the screen, never through a
          value of its own. */}
      <header className="shrink-0 px-4 pb-4 pt-3 sm:px-6" style={{ background: C.card, color: C.text, borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          {/* The way out travels with the period strip, not with the actions: leaving
              is not a recording action, and the period row has room the button row does
              not. The game is not over for all that — you return to its record, and
              "Resume" brings you back here. */}
          <div className="flex items-center gap-2">
            {/* The scorer's table lives outside the shell: without this copy, the one
                screen where people record for two hours would be the only one saying
                nothing about an interrupted share. */}
            <ConnectionState compact />
            <Link to={`/match/${match.id}`} aria-label={translate('live.leave')} title={translate('live.leave')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--c-card2)] text-base font-black text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]"><X className="h-5 w-5" strokeWidth={2.5} /></Link>
            <PeriodStrip current={ls.period} />
          </div>
          {/* `flex-wrap`: five finger-wide controls do not fit on one phone row. They
              wrap rather than push the last of them — "Finish" — off the screen. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to={`/match/${match.id}/watch`} target="_blank" aria-label={translate('live.spectatorView')} title={translate('live.spectatorView')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--c-card2)] text-base text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]"><Eye className="h-[18px] w-[18px]" strokeWidth={2} /></Link>
            <SbButton onClick={undo} title={translate('live.undoTitle')}>{translate('live.undo')}</SbButton>
            <SbButton onClick={nextPeriod} title={translate('live.periodTitle')}>{translate('live.period')}</SbButton>
            {/* A gap before the irreversible. "Finish" freezes the score; it sat eight
                pixels from "Next period", which is the width of a badly placed
                thumb. */}
            <span className="w-3 shrink-0" aria-hidden />
            <SbButton onClick={() => setAskFinish(true)} danger>{translate('live.finish')}</SbButton>
          </div>
        </div>

        <div className="mx-auto mt-3 grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-1 overflow-hidden sm:gap-6">
          {/* Us in ink, the opposition in accent: "us or them", and both tokens switch
              with the theme instead of carrying a hard-coded white. */}
          <ScoreSide align="right" color={C.text} name={teamNames.A} score={ls.score.a} lead={ls.score.a > ls.score.b} />
          <GameClock running={ls.clockRunning} seconds={seconds} onToggle={toggleClock} />
          <ScoreSide align="left" color={C.accent} name={teamNames.B} score={ls.score.b} lead={ls.score.b > ls.score.a} />
        </div>

        {/* The clock corrections on their own row, and not in the grid's centre
            column: at five finger-wide buttons that column grew wider than the screen
            and pushed both scores out of frame. The score comes before the
            adjustment. */}
        <div className="mx-auto mt-2.5 flex max-w-4xl flex-wrap items-center justify-center gap-1" title={translate('live.fixClock')}>
          <ClockAdjust onClick={() => setSeconds((s) => clampClock(s - 10))}>−10s</ClockAdjust>
          <ClockAdjust gap onClick={() => setSeconds((s) => clampClock(s - 1))}>−1s</ClockAdjust>
          <ClockAdjust onClick={() => setSeconds((s) => clampClock(s + 1))}>+1s</ClockAdjust>
          <ClockAdjust gap onClick={() => setSeconds((s) => clampClock(s + 10))}>+10s</ClockAdjust>
          <ClockAdjust gap onClick={() => setEditClock(true)}><Pencil className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2} />{translate('live.editClock')}</ClockAdjust>
        </div>
      </header>

      {error && <div className="shrink-0 bg-[var(--c-danger-bg)] py-1.5 text-center text-sm font-semibold text-[var(--c-danger)]">{error}</div>}

      {/* OPPOSITION SCORE: a total, with no players. One row — the "total score, no
          player detail" note explained at every game a fact you learn at the first,
          and the third row it forced on a phone was taken out of the roster. */}
      <div className="mx-auto mt-2 flex w-full max-w-4xl shrink-0 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 sm:mt-4 sm:px-4">
        <span className="min-w-0 truncate text-sm font-extrabold uppercase tracking-tight">{teamNames.B}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {OPP_POINTS.map(({ k, n }) => (
            <button key={k} onClick={() => oppScore(k)} aria-label={translate('live.addPoints', { count: n, team: teamNames.B })}
              className="nums h-11 min-w-11 rounded-lg bg-[var(--c-card2)] px-3 text-sm font-black text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90">
              +{n}
            </button>
          ))}
          <button onClick={removeOppScore} aria-label={translate('live.removeBasket', { team: teamNames.B })}
            className="h-11 w-11 rounded-lg bg-[var(--c-card2)] text-sm font-bold text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90">
            <RotateCcw className="mx-auto h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* `min-h-0`: without it, a flex child refuses to be squeezed below its
          content's size and the roster would push the scoreboard off the screen
          instead of scrolling in its own box. */}
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-2 sm:p-4">
        <TeamPanel
          title={teamNames.A.toUpperCase()} color={TEAM_A} players={onCourt()}
          statsByPlayer={statsByPlayer()} teamFouls={ls.teamFoulsThisPeriod.A}
          bonus={ls.bonus.A} timeoutsRemaining={ls.timeoutsRemaining.A} timeoutsUsed={ls.timeoutsUsed.A}
          onPick={(id, name) => setPick({ id, name })}
          onScore={(id, kind) => dispatch({ type: 'SCORE', team: 'A', playerId: id, kind, period: ls.period, gameClock: seconds })}
          onFoul={(id) => dispatch({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: id }, foulType: 'personal', period: ls.period, gameClock: seconds })}
          onSub={() => setSub(true)}
          onTimeout={() => dispatch({ type: 'TIMEOUT', team: 'A', period: ls.period, gameClock: seconds })}
          onUndoTimeout={() => removeLast((e) => e.type === 'TIMEOUT' && e.team === 'A')}
        />
      </div>

      <PlayerActionDialog
        open={!!pick} playerName={pick?.name ?? ''} color={TEAM_A}
        scoreCounts={pick ? scoreCounts(pick.id) : undefined}
        statCounts={pick ? statCounts(pick.id) : undefined}
        foulCounts={pick ? foulCounts(pick.id) : undefined}
        fouls={pick ? statsByPlayer().get(pick.id)?.fouls ?? 0 : 0}
        misses={pick ? missCount(pick.id) : 0}
        shots={pick ? shotsOf([match], pick.id) : undefined}
        onClose={() => setPick(null)} onScore={score} onMiss={miss} onFoul={foul}
        onStat={(kind) => pick && dispatch({ type: 'STAT', team: 'A', playerId: pick.id, stat: kind, period: ls.period, gameClock: seconds })}
        onRemoveScore={(kind) => pick && removeLast((e) => e.type === 'SCORE' && e.team === 'A' && e.playerId === pick.id && e.kind === kind)}
        onRemoveFoul={(type) => pick && removeLast((e) => e.type === 'FOUL' && e.team === 'A' && e.foulType === type && e.target.kind === 'player' && e.target.playerId === pick.id)}
        onRemoveStat={(kind) => pick && removeLast((e) => e.type === 'STAT' && e.team === 'A' && e.playerId === pick.id && e.stat === kind)}
        onRemoveMiss={() => pick && removeLast((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === pick.id)}
      />
      <ClockEditDialog open={editClock} seconds={seconds} max={periodLength(ls.period)}
        onClose={() => setEditClock(false)} onSubmit={(s) => setSeconds(clampClock(s))} />
      {/* We only leave the game if it really is closed: `finish()` reports whether the
          write landed, and on failure we stay, with the error band above explaining it.
          Leaving regardless would take the volunteer out to a record announcing a
          finished game that is not. */}
      <ConfirmDialog open={askFinish} onClose={() => setAskFinish(false)} onConfirm={async () => { if (await finish()) onFinish() }}
        title={translate('live.finishTitle')} message={translate('live.finishText')} confirmLabel={translate('live.finish')} danger />
      <SubstitutionDialog open={sub} onClose={() => setSub(false)}
        onCourtPlayers={onCourt()} benchPlayers={bench()}
        onSubmit={(playerOutId, playerInId) => dispatch({ type: 'SUBSTITUTION', team: 'A', playerOutId, playerInId, period: ls.period, gameClock: seconds })} />
    </div>
  )
}
