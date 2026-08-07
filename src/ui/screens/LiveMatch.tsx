import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameClock } from '../components/GameClock'
import { TeamPanel } from '../components/TeamPanel'
import { Link } from 'react-router-dom'
import { PlayerActionDialog } from '../components/PlayerActionDialog'
import { ClockEditDialog } from '../components/ClockEditDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StartingFiveGate } from '../components/StartingFiveGate'
import { useAdmin } from '../../app/admin'
import { syncEnabled, publishBundle } from '../../app/sync'
import { SubstitutionDialog } from '../components/SubstitutionDialog'
import { useMatch } from '../../app/useMatch'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { listPlayers, listTeams } from '../../persistence/repositories'
import { periodLength } from '../../domain/ids'
import { ClockAdjust, PeriodStrip, ScoreSide, SbButton } from '../components/Scoreboard'
import type { Match, Period, Player, ScoreKind, StatKind, FoulType, TeamSide, ShotSpot } from '../../domain/types'

const TEAM_A = 'var(--team-a)'
const TEAM_B = 'var(--team-b)'

/** Chrono restant à reprendre pour la période courante : celui du dernier évènement
 * de cette période dans le journal, ou la durée pleine si la période vient de commencer. */
function seedSeconds(match: Match, period: Period): number {
  for (let i = match.events.length - 1; i >= 0; i--) {
    if (match.events[i].period === period) return match.events[i].gameClock
  }
  return periodLength(period)
}

export function LiveMatch({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const navigate = useNavigate()
  const { isAdmin, guard } = useAdmin()
  const { match, dispatch, dispatchMany, undo, removeLast, finish, error } = useMatch(matchId)
  const [askFinish, setAskFinish] = useState(false)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<{ A: string; B: string }>({ A: 'Locaux', B: 'Visiteurs' })
  const [seconds, setSeconds] = useState(600)
  const [pick, setPick] = useState<{ side: TeamSide; id: string; name: string } | null>(null)
  const [starters, setStarters] = useState<{ A: string[]; B: string[] }>({ A: [], B: [] })
  const [subSide, setSubSide] = useState<TeamSide | null>(null)
  const [editClock, setEditClock] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const seededMatchId = useRef<string | null>(null)

  const ls = match ? liveState(match) : null

  useEffect(() => {
    if (!match) return
    Promise.all([listPlayers(match.meta.teamAId), listPlayers(match.meta.teamBId), listTeams()]).then(([a, b, teams]) => {
      const map: Record<string, Player> = {}
      for (const p of [...a, ...b]) map[p.id] = p
      setPlayers(map)
      const byId = Object.fromEntries(teams.map((t) => [t.id, t.name]))
      setTeamNames({
        A: byId[match.meta.teamAId] ?? 'Locaux',
        B: byId[match.meta.teamBId] ?? 'Visiteurs',
      })
    })
  }, [match?.meta.teamAId, match?.meta.teamBId])

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

  // Suivi spectateur (multi-appareils) : publie l'état à chaque changement.
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

  // La table de marque (saisie du match) est réservée à l'admin ; les
  // spectateurs passent par /watch (lecture seule).
  if (!isAdmin)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-extrabold tracking-tight">Accès table de marque</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Le mot de passe administrateur est requis pour saisir la rencontre.</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => guard(() => {})} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110">
            🔓 Déverrouiller
          </button>
          <Link to={`/match/${matchId}/watch`} className="rounded-xl border border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted">
            👁 Suivi spectateur
          </Link>
        </div>
        <button onClick={() => navigate('/')} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground">← Accueil</button>
      </div>
    )

  const rosterPlayers = (side: TeamSide) => match.roster[side].map((id) => players[id]).filter(Boolean)
  const teamName = (side: TeamSide) => teamNames[side]

  const hasStartingFive = (side: TeamSide) =>
    match.events.some((e) => e.type === 'STARTING_FIVE' && e.team === side)

  if (!hasStartingFive('A') || !hasStartingFive('B')) {
    const requiredFor = (side: TeamSide) => Math.min(5, match.roster[side].length)
    const toggleStarter = (side: TeamSide, id: string) => {
      setStarters((prev) => {
        const cur = prev[side]
        if (cur.includes(id)) return { ...prev, [side]: cur.filter((x) => x !== id) }
        if (cur.length >= requiredFor(side)) return prev
        return { ...prev, [side]: [...cur, id] }
      })
    }
    const canStart = starters.A.length === requiredFor('A') && starters.B.length === requiredFor('B')
    // Ordonne le cinq de départ par numéro pour un affichage propre ; les
    // remplacements ultérieurs conserveront ensuite la position de chaque slot.
    const byNumber = (ids: string[]) => [...ids].sort((a, b) => (players[a]?.number ?? 0) - (players[b]?.number ?? 0))
    const startMatch = () => guard(() => dispatchMany([
      { type: 'STARTING_FIVE', team: 'A', playerIds: byNumber(starters.A), period: ls.period, gameClock: periodLength(ls.period) },
      { type: 'STARTING_FIVE', team: 'B', playerIds: byNumber(starters.B), period: ls.period, gameClock: periodLength(ls.period) },
    ]))
    return (
      <StartingFiveGate
        rosterA={rosterPlayers('A')} rosterB={rosterPlayers('B')}
        requiredA={requiredFor('A')} requiredB={requiredFor('B')} selected={starters}
        onToggle={toggleStarter} onStart={startMatch} canStart={canStart}
        onExit={() => navigate('/')}
      />
    )
  }

  const toggleClock = () =>
    dispatch({ type: ls.clockRunning ? 'CLOCK_STOP' : 'CLOCK_START', period: ls.period, gameClock: seconds })

  const statsByPlayer = (side: TeamSide) => {
    const map = new Map<string, { points: number; fouls: number }>()
    for (const s of playerStats(match, side)) map.set(s.playerId, { points: s.points, fouls: s.fouls })
    return map
  }
  const quickScore = (side: TeamSide, playerId: string, kind: ScoreKind) =>
    dispatch({ type: 'SCORE', team: side, playerId, kind, period: ls.period, gameClock: seconds })
  const quickFoul = (side: TeamSide, playerId: string) =>
    dispatch({ type: 'FOUL', team: side, target: { kind: 'player', playerId }, foulType: 'personal', period: ls.period, gameClock: seconds })
  const quickStat = (side: TeamSide, playerId: string, stat: StatKind) =>
    dispatch({ type: 'STAT', team: side, playerId, stat, period: ls.period, gameClock: seconds })
  const quickMiss = (side: TeamSide, playerId: string, kind: ScoreKind, shot: ShotSpot) =>
    dispatch({ type: 'MISS', team: side, playerId, kind, shot, period: ls.period, gameClock: seconds })
  const removeMiss = (side: TeamSide, playerId: string) =>
    removeLast((e) => e.type === 'MISS' && e.team === side && e.playerId === playerId)
  const missCount = (side: TeamSide, playerId: string) =>
    match.events.filter((e) => e.type === 'MISS' && e.team === side && e.playerId === playerId).length

  // Corrections (erreurs de saisie) : on retire le dernier évènement concerné.
  // Retrait ciblé d'un type de panier précis (le dernier 3 pts, même si un 2 a suivi).
  const removeScoreKind = (side: TeamSide, playerId: string, kind: ScoreKind) =>
    removeLast((e) => e.type === 'SCORE' && e.team === side && e.playerId === playerId && e.kind === kind)
  const removeFoul = (side: TeamSide, playerId: string) =>
    removeLast((e) => e.type === 'FOUL' && e.team === side && e.target.kind === 'player' && e.target.playerId === playerId)
  const removeStatKind = (side: TeamSide, playerId: string, stat: StatKind) =>
    removeLast((e) => e.type === 'STAT' && e.team === side && e.playerId === playerId && e.stat === stat)
  const statCounts = (side: TeamSide, playerId: string): Record<StatKind, number> => {
    const c: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }
    for (const e of match.events)
      if (e.type === 'STAT' && e.team === side && e.playerId === playerId) c[e.stat]++
    return c
  }
  const removeTimeout = (side: TeamSide) =>
    removeLast((e) => e.type === 'TIMEOUT' && e.team === side)
  /** Nombre de paniers par type pour un joueur (active/désactive les boutons de correction). */
  const scoreCounts = (side: TeamSide, playerId: string): Record<ScoreKind, number> => {
    const c: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
    for (const e of match.events)
      if (e.type === 'SCORE' && e.team === side && e.playerId === playerId) c[e.kind]++
    return c
  }
  // Correction du chrono (souci de buzzer) : pas à pas ou saisie manuelle.
  const clampClock = (s: number) => Math.min(periodLength(ls.period), Math.max(0, s))
  const adjustClock = (delta: number) => setSeconds((s) => clampClock(s + delta))

  const score = (kind: ScoreKind, shot?: ShotSpot) => pick &&
    dispatch({ type: 'SCORE', team: pick.side, playerId: pick.id, kind, shot, period: ls.period, gameClock: seconds })
  const foul = (type: FoulType) => pick &&
    dispatch({ type: 'FOUL', team: pick.side, target: { kind: 'player', playerId: pick.id }, foulType: type, period: ls.period, gameClock: seconds })

  // Ordre = celui de ls.onCourt (le remplaçant hérite de la place du sortant).
  const onCourtFor = (side: TeamSide) => {
    const byId = new Map(rosterPlayers(side).map((p) => [p.id, p]))
    return ls.onCourt[side].map((id) => byId.get(id)).filter((p): p is Player => !!p)
  }
  const benchFor = (side: TeamSide) => {
    const onCourtSet = new Set(ls.onCourt[side])
    const fouledOutSet = new Set(ls.fouledOut[side])
    return rosterPlayers(side).filter((p) => !onCourtSet.has(p.id) && !fouledOutSet.has(p.id))
  }
  const submitSub = (side: TeamSide, playerOutId: string, playerInId: string) =>
    dispatch({ type: 'SUBSTITUTION', team: side, playerOutId, playerInId, period: ls.period, gameClock: seconds })

  const nextPeriod = () => {
    const next = ls.period + 1
    dispatchMany([
      { type: 'PERIOD_END', period: ls.period, gameClock: seconds },
      { type: 'PERIOD_START', period: next, gameClock: periodLength(next) },
    ])
    setSeconds(periodLength(next))
  }

  const doFinish = async () => { await finish(); onFinish() }

  return (
    <div className="flex min-h-full flex-col">
      {/* SCOREBOARD */}
      <header className="rounded-t-none px-4 pb-4 pt-3 text-[var(--scoreboard-fg)] sm:px-6" style={{ background: 'var(--scoreboard)' }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <PeriodStrip current={ls.period} />
          <div className="flex items-center gap-2">
            <Link to={`/match/${match.id}/watch`} target="_blank" title="Ouvrir le suivi spectateur"
              className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/20">👁 Suivi</Link>
            <SbButton onClick={undo} title="Annuler la dernière action">↩︎ Annuler</SbButton>
            <SbButton onClick={nextPeriod}>Période suivante →</SbButton>
            <SbButton onClick={() => setAskFinish(true)} danger>Terminer</SbButton>
          </div>
        </div>

        <div className="mx-auto mt-3 grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-1 overflow-hidden sm:gap-6">
          <ScoreSide align="right" color="var(--sb-team-a)" name={teamName('A')} score={ls.score.a} lead={ls.score.a > ls.score.b} />
          <div className="flex flex-col items-center gap-2">
            <GameClock running={ls.clockRunning} seconds={seconds} onToggle={toggleClock} />
            <div className="flex flex-wrap items-center justify-center gap-1" title="Corriger le chrono (buzzer)">
              <ClockAdjust onClick={() => adjustClock(-10)}>−10s</ClockAdjust>
              <ClockAdjust onClick={() => adjustClock(-1)}>−1s</ClockAdjust>
              <ClockAdjust onClick={() => adjustClock(1)}>+1s</ClockAdjust>
              <ClockAdjust onClick={() => adjustClock(10)}>+10s</ClockAdjust>
              <ClockAdjust onClick={() => setEditClock(true)}>✎ Éditer</ClockAdjust>
            </div>
          </div>
          <ScoreSide align="left" color="var(--sb-team-b)" name={teamName('B')} score={ls.score.b} lead={ls.score.b > ls.score.a} />
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 py-1.5 text-center text-sm font-semibold text-red-600">{error}</div>
      )}

      {/* TEAM COLUMNS */}
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-2 gap-2 p-2 sm:gap-4 sm:p-4">
        <TeamPanel
          title="LOCAUX" color={TEAM_A} players={onCourtFor('A')}
          statsByPlayer={statsByPlayer('A')} teamFouls={ls.teamFoulsThisPeriod.A}
          bonus={ls.bonus.A} timeoutsRemaining={ls.timeoutsRemaining.A} timeoutsUsed={ls.timeoutsUsed.A}
          onPick={(id, name) => setPick({ side: 'A', id, name })}
          onScore={(id, kind) => quickScore('A', id, kind)} onFoul={(id) => quickFoul('A', id)}
          onSub={() => setSubSide('A')}
          onTimeout={() => dispatch({ type: 'TIMEOUT', team: 'A', period: ls.period, gameClock: seconds })}
          onUndoTimeout={() => removeTimeout('A')}
        />
        <TeamPanel
          title="VISITEURS" color={TEAM_B} players={onCourtFor('B')}
          statsByPlayer={statsByPlayer('B')} teamFouls={ls.teamFoulsThisPeriod.B}
          bonus={ls.bonus.B} timeoutsRemaining={ls.timeoutsRemaining.B} timeoutsUsed={ls.timeoutsUsed.B}
          onPick={(id, name) => setPick({ side: 'B', id, name })}
          onScore={(id, kind) => quickScore('B', id, kind)} onFoul={(id) => quickFoul('B', id)}
          onSub={() => setSubSide('B')}
          onTimeout={() => dispatch({ type: 'TIMEOUT', team: 'B', period: ls.period, gameClock: seconds })}
          onUndoTimeout={() => removeTimeout('B')}
        />
      </div>

      <PlayerActionDialog
        open={!!pick} playerName={pick?.name ?? ''} color={pick?.side === 'B' ? TEAM_B : TEAM_A}
        scoreCounts={pick ? scoreCounts(pick.side, pick.id) : undefined}
        statCounts={pick ? statCounts(pick.side, pick.id) : undefined}
        fouls={pick ? statsByPlayer(pick.side).get(pick.id)?.fouls ?? 0 : 0}
        onClose={() => setPick(null)} onScore={score} onFoul={foul}
        onStat={(kind) => pick && quickStat(pick.side, pick.id, kind)}
        onRemoveScore={(kind) => pick && removeScoreKind(pick.side, pick.id, kind)}
        onRemoveFoul={() => pick && removeFoul(pick.side, pick.id)}
        onRemoveStat={(kind) => pick && removeStatKind(pick.side, pick.id, kind)}
        misses={pick ? missCount(pick.side, pick.id) : 0}
        onMiss={(kind, shot) => pick && quickMiss(pick.side, pick.id, kind, shot)}
        onRemoveMiss={() => pick && removeMiss(pick.side, pick.id)}
      />
      <ClockEditDialog
        open={editClock} seconds={seconds} max={periodLength(ls.period)}
        onClose={() => setEditClock(false)} onSubmit={(s) => setSeconds(clampClock(s))}
      />
      <ConfirmDialog open={askFinish} onClose={() => setAskFinish(false)} onConfirm={doFinish}
        title="Terminer le match ?" message="Le score est figé et la rencontre passe en « terminée ». Cette action est définitive." confirmLabel="Terminer" danger />
      <SubstitutionDialog
        open={subSide !== null} onClose={() => setSubSide(null)}
        onCourtPlayers={subSide ? onCourtFor(subSide) : []}
        benchPlayers={subSide ? benchFor(subSide) : []}
        onSubmit={(playerOutId, playerInId) => subSide && submitSub(subSide, playerOutId, playerInId)}
      />
    </div>
  )
}
