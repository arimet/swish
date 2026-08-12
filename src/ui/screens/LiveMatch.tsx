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
import { useAuth } from '../../app/auth'
import { syncEnabled, publishBundle } from '../../app/sync'
import { useMatch } from '../../app/useMatch'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { shotsOf } from '../../domain/shotchart'
import { listPlayers, listTeams } from '../../persistence/repositories'
import { periodLength, seedSeconds } from '../../domain/ids'
import type { Match, Player, ScoreKind, ShotSpot, StatKind, FoulType } from '../../domain/types'

const TEAM_A = 'var(--team-a)'
const OPP_POINTS: { k: ScoreKind; n: number }[] = [{ k: 'lf', n: 1 }, { k: '2int', n: 2 }, { k: '3', n: 3 }]

/**
 * Table de marque du match : notre effectif est détaillé joueur par joueur,
 * l'adversaire se résume à un score saisi globalement.
 */
export function LiveMatch({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const navigate = useNavigate()
  const { can, guard } = useAuth()
  const { match, dispatch, dispatchMany, undo, removeLast, finish, error } = useMatch(matchId)
  const [askFinish, setAskFinish] = useState(false)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<{ A: string; B: string }>({ A: 'Mon équipe', B: 'Adversaire' })
  const [seconds, setSeconds] = useState(600)
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null)
  const [starters, setStarters] = useState<string[]>([])
  const [sub, setSub] = useState(false)
  const [editClock, setEditClock] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const seededMatchId = useRef<string | null>(null)

  const ls = match ? liveState(match) : null

  useEffect(() => {
    if (!match) return
    Promise.all([listPlayers(match.meta.clubId), listTeams()]).then(([a, teams]) => {
      setPlayers(Object.fromEntries(a.map((p) => [p.id, p])))
      const byId = Object.fromEntries(teams.map((t) => [t.id, t.name]))
      setTeamNames({ A: byId[match.meta.clubId] ?? 'Mon équipe', B: byId[match.meta.opponentId] ?? 'Adversaire' })
    })
  }, [match?.meta.clubId, match?.meta.opponentId])

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

  // Suivi spectateur (multi-appareils) : publie l'état à chaque changement, et
  // republie au retour du réseau (une saisie hors ligne ne se repousse sinon
  // qu'au prochain évènement).
  useEffect(() => {
    if (!match || !syncEnabled()) return
    const bundle = { match, players: Object.values(players), teamNames }
    publishBundle(bundle)
    const onOnline = () => publishBundle(bundle)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [match, players, teamNames])

  if (!match || !ls)
    return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>

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

  // Panier adverse : pas de joueur identifié, seul le score compte.
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
    <div className="flex min-h-full flex-col">
      <header className="px-4 pb-4 pt-3 text-[var(--scoreboard-fg)] sm:px-6" style={{ background: 'var(--scoreboard)' }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <PeriodStrip current={ls.period} />
          <div className="flex items-center gap-2">
            <Link to={`/match/${match.id}/watch`} target="_blank" title="Ouvrir le suivi spectateur"
              className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/20">👁 Suivi</Link>
            <SbButton onClick={undo} title="Annuler la dernière action">↩︎ Annuler</SbButton>
            <SbButton onClick={nextPeriod}>Période suivante →</SbButton>
            <SbButton onClick={() => setAskFinish(true)} danger>Terminer</SbButton>
          </div>
        </div>

        <div className="mx-auto mt-3 grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-1 overflow-hidden sm:gap-6">
          <ScoreSide align="right" color="var(--sb-team-a)" name={teamNames.A} score={ls.score.a} lead={ls.score.a > ls.score.b} />
          <div className="flex flex-col items-center gap-2">
            <GameClock running={ls.clockRunning} seconds={seconds} onToggle={toggleClock} />
            <div className="flex flex-wrap items-center justify-center gap-1" title="Corriger le chrono (buzzer)">
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s - 10))}>−10s</ClockAdjust>
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s - 1))}>−1s</ClockAdjust>
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s + 1))}>+1s</ClockAdjust>
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s + 10))}>+10s</ClockAdjust>
              <ClockAdjust onClick={() => setEditClock(true)}>✎ Éditer</ClockAdjust>
            </div>
          </div>
          <ScoreSide align="left" color="var(--sb-team-b)" name={teamNames.B} score={ls.score.b} lead={ls.score.b > ls.score.a} />
        </div>
      </header>

      {error && <div className="bg-red-500/10 py-1.5 text-center text-sm font-semibold text-red-600">{error}</div>}

      {/* SCORE ADVERSE : global, sans joueurs */}
      <div className="mx-auto mt-2 flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/50 px-4 py-2.5 sm:mt-4">
        <span className="text-sm font-extrabold uppercase tracking-tight">{teamNames.B}</span>
        <span className="text-[11px] font-semibold text-muted-foreground">score global — pas de détail joueur</span>
        <div className="ml-auto flex items-center gap-1.5">
          {OPP_POINTS.map(({ k, n }) => (
            <button key={k} onClick={() => oppScore(k)} aria-label={`Ajouter ${n} point${n > 1 ? 's' : ''} à ${teamNames.B}`}
              className="nums rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-black text-white transition hover:bg-[#ff4d6d] active:scale-90">
              +{n}
            </button>
          ))}
          <button onClick={removeOppScore} aria-label={`Retirer le dernier panier de ${teamNames.B}`}
            className="rounded-lg bg-white/[0.06] px-2.5 py-2 text-sm font-bold text-muted-foreground transition hover:bg-[#ff4d6d] hover:text-white active:scale-90">
            ↺
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 p-2 sm:p-4">
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
        fouls={pick ? statsByPlayer().get(pick.id)?.fouls ?? 0 : 0}
        misses={pick ? missCount(pick.id) : 0}
        shots={pick ? shotsOf([match], pick.id) : undefined}
        onClose={() => setPick(null)} onScore={score} onMiss={miss} onFoul={foul}
        onStat={(kind) => pick && dispatch({ type: 'STAT', team: 'A', playerId: pick.id, stat: kind, period: ls.period, gameClock: seconds })}
        onRemoveScore={(kind) => pick && removeLast((e) => e.type === 'SCORE' && e.team === 'A' && e.playerId === pick.id && e.kind === kind)}
        onRemoveFoul={() => pick && removeLast((e) => e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player' && e.target.playerId === pick.id)}
        onRemoveStat={(kind) => pick && removeLast((e) => e.type === 'STAT' && e.team === 'A' && e.playerId === pick.id && e.stat === kind)}
        onRemoveMiss={() => pick && removeLast((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === pick.id)}
      />
      <ClockEditDialog open={editClock} seconds={seconds} max={periodLength(ls.period)}
        onClose={() => setEditClock(false)} onSubmit={(s) => setSeconds(clampClock(s))} />
      <ConfirmDialog open={askFinish} onClose={() => setAskFinish(false)} onConfirm={async () => { await finish(); onFinish() }}
        title="Terminer le match ?" message="Le score est figé et la rencontre passe en « terminée ». Cette action est définitive." confirmLabel="Terminer" danger />
      <SubstitutionDialog open={sub} onClose={() => setSub(false)}
        onCourtPlayers={onCourt()} benchPlayers={bench()}
        onSubmit={(playerOutId, playerInId) => dispatch({ type: 'SUBSTITUTION', team: 'A', playerOutId, playerInId, period: ls.period, gameClock: seconds })} />
    </div>
  )
}
