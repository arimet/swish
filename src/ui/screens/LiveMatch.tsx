import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GameClock, fmt } from '../components/GameClock'
import { TeamPanel } from '../components/TeamPanel'
import { PlayerActionDialog } from '../components/PlayerActionDialog'
import { ClockEditDialog } from '../components/ClockEditDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StartingFiveGate } from '../components/StartingFiveGate'
import { AccessGate } from '../components/AccessGate'
import { SubstitutionDialog } from '../components/SubstitutionDialog'
import { HistoryDialog } from '../components/HistoryDialog'
import { ClockAdjust, PeriodStrip, ScoreSide, SbButton } from '../components/Scoreboard'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { ConnectionState } from '../components/ConnectionState'
import { useAuth } from '../../app/auth'
import { useMatch, type EventInput } from '../../app/useMatch'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { shotsOf } from '../../domain/shotchart'
import { usePlayersById, useTeamsById } from '../../persistence/queries'
import { periodLength, seedSeconds } from '../../domain/ids'
import type { GameEvent, Player, ScoreKind, ShotSpot, FoulType } from '../../domain/types'
import { Eye, Pencil, X } from 'lucide-react'

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
  const { match, dispatch, dispatchMany, remove, rewrite, finish, error } = useMatch(matchId)
  const [askFinish, setAskFinish] = useState(false)
  // "Next period" resets the clock and the team fouls: one tap too many is a quarter
  // lost, so it asks first — unlike the entries, which the history takes back.
  const [askPeriod, setAskPeriod] = useState(false)
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
  const [history, setHistory] = useState(false)
  /** An action being modified from the history: what the player dialog enters goes in
   *  its place (`replace`), then right after what replaced it (`after`) — a modified
   *  basket's pass — at the period and game clock of the action it replaces. */
  const [editing, setEditing] = useState<{ id: string; mode: 'replace' | 'after'; period: number; gameClock: number } | null>(null)
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
  /** When the player dialog's entries happen: now, or when the action being modified did. */
  const when = () => editing ? { period: editing.period, gameClock: editing.gameClock } : { period: ls.period, gameClock: seconds }
  /** Everything the player dialog enters goes through here: one write, at the end of
   *  the log — or where the action being modified stood. */
  const write = async (inputs: EventInput[]) => {
    if (!editing) return dispatchMany(inputs)
    const ids = await rewrite(inputs, editing)
    if (ids.length) setEditing({ ...editing, id: ids[ids.length - 1], mode: 'after' })
  }
  const shot = (made: boolean, kind: ScoreKind, spot?: ShotSpot): EventInput => made
    ? { type: 'SCORE', team: 'A', playerId: pick!.id, kind, shot: spot, ...when() }
    : { type: 'MISS', team: 'A', playerId: pick!.id, kind, shot: spot, ...when() }
  const score = (kind: ScoreKind, spot?: ShotSpot) => pick && write([shot(true, kind, spot)])
  const miss = (kind: ScoreKind, spot: ShotSpot) => pick && write([shot(false, kind, spot)])
  // One write for the whole trip to the line, in the order the attempts were shot.
  const freeThrows = (results: boolean[]) => pick && write(results.map((ok) => shot(ok, 'lf')))
  // The and-one: the opposition's foul on the shot, then the free throw it gives.
  const andOne = (made: boolean) => pick && write([
    { type: 'FOUL', team: 'B', target: { kind: 'team' }, foulType: 'defensive', ...when() },
    shot(made, 'lf'),
  ])
  const foul = (type: FoulType) => pick &&
    write([{ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: pick.id }, foulType: type, ...when() }])

  // An opposition basket: no player named, only the score counts.
  const oppScore = (kind: ScoreKind) =>
    dispatch({ type: 'SCORE', team: 'B', kind, period: ls.period, gameClock: seconds })

  /** The history's "Modify": the dialog of the player chosen, whose entry replaces the
   *  action at its period and clock. */
  const modify = (e: GameEvent, playerId: string) => {
    const p = players[playerId]
    setEditing({ id: e.id, mode: 'replace', period: e.period, gameClock: e.gameClock })
    setPick({ id: playerId, name: p ? `${p.number} ${p.lastName}` : playerId })
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
            <SbButton onClick={() => setHistory(true)} title={translate('live.undoTitle')}>{translate('live.undo')}</SbButton>
            <SbButton onClick={() => setAskPeriod(true)} title={translate('live.periodTitle')}>{translate('live.period')}</SbButton>
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
        {/* Their team fouls: the only fouls of theirs entered are the and-ones', but
            they count towards the bonus all the same. */}
        {ls.teamFoulsThisPeriod.B > 0 && (
          <span className={`shrink-0 rounded-lg px-2 py-1 text-[12px] font-bold ${ls.bonus.B ? 'bg-[var(--c-danger-fill)] text-[var(--c-on-danger)]' : 'bg-muted text-muted-foreground'}`}>
            {ls.bonus.B ? translate('panel.bonus') : translate('panel.fouls')} <span className="nums">{ls.teamFoulsThisPeriod.B}</span>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {OPP_POINTS.map(({ k, n }) => (
            <button key={k} onClick={() => oppScore(k)} aria-label={translate('live.addPoints', { count: n, team: teamNames.B })}
              className="nums h-11 min-w-11 rounded-lg bg-[var(--c-card2)] px-3 text-sm font-black text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90">
              +{n}
            </button>
          ))}
        </div>
      </div>

      {/* `min-h-0`: without it, a flex child refuses to be squeezed below its
          content's size and the roster would push the scoreboard off the screen
          instead of scrolling in its own box. */}
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-2 sm:p-4">
        <TeamPanel
          title={teamNames.A.toUpperCase()} color={TEAM_A} players={onCourt()}
          statsByPlayer={statsByPlayer()} teamFouls={ls.teamFoulsThisPeriod.A}
          bonus={ls.bonus.A} timeoutsRemaining={ls.timeoutsRemaining.A}
          onPick={(id, name) => setPick({ id, name })}
          onScore={(id, kind) => dispatch({ type: 'SCORE', team: 'A', playerId: id, kind, period: ls.period, gameClock: seconds })}
          onFoul={(id) => dispatch({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: id }, foulType: 'personal', period: ls.period, gameClock: seconds })}
          onSub={() => setSub(true)}
          onTimeout={() => dispatch({ type: 'TIMEOUT', team: 'A', period: ls.period, gameClock: seconds })}
        />
      </div>

      <PlayerActionDialog
        open={!!pick} playerName={pick ? (editing ? translate('history.modifying', { name: pick.name }) : pick.name) : ''} color={TEAM_A}
        teammates={onCourt().filter((p) => p.id !== pick?.id).map((p) => ({ id: p.id, name: `${p.number} ${p.lastName}` }))}
        onAssist={(playerId) => write([{ type: 'STAT', team: 'A', playerId, stat: 'assist', ...when() }])}
        shots={pick ? shotsOf([match], pick.id) : undefined}
        onClose={() => { setPick(null); setEditing(null) }} onScore={score} onMiss={miss} onFreeThrows={freeThrows} onAndOne={andOne} onFoul={foul}
        onStat={(kind) => pick && write([{ type: 'STAT', team: 'A', playerId: pick.id, stat: kind, ...when() }])}
      />
      <HistoryDialog open={history} events={match.events} players={players} teamNames={teamNames} roster={rosterPlayers}
        onClose={() => setHistory(false)} onDelete={remove} onModify={modify} />
      <ClockEditDialog open={editClock} seconds={seconds} max={periodLength(ls.period)}
        onClose={() => setEditClock(false)} onSubmit={(s) => setSeconds(clampClock(s))} />
      {/* We only leave the game if it really is closed: `finish()` reports whether the
          write landed, and on failure we stay, with the error band above explaining it.
          Leaving regardless would take the volunteer out to a record announcing a
          finished game that is not. */}
      <ConfirmDialog open={askFinish} onClose={() => setAskFinish(false)} onConfirm={async () => { if (await finish()) onFinish() }}
        title={translate('live.finishTitle')} message={translate('live.finishText')} confirmLabel={translate('live.finish')} danger />
      <ConfirmDialog open={askPeriod} onClose={() => setAskPeriod(false)} onConfirm={nextPeriod}
        title={translate(ls.period + 1 <= 4 ? 'live.periodConfirm' : 'live.overtimeConfirm', { n: ls.period + 1 <= 4 ? ls.period + 1 : ls.period - 3 })}
        message={translate('live.periodConfirmText', { clock: fmt(periodLength(ls.period + 1)) })} confirmLabel={translate('live.period')} />
      <SubstitutionDialog open={sub} onClose={() => setSub(false)}
        onCourtPlayers={onCourt()} benchPlayers={bench()}
        onSubmit={(pairs) => dispatchMany(pairs.map(([playerOutId, playerInId]) => ({ type: 'SUBSTITUTION', team: 'A', playerOutId, playerInId, period: ls.period, gameClock: seconds })))} />
    </div>
  )
}
