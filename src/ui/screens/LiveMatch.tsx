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
import { useAuth } from '../../app/auth'
import { useMatch } from '../../app/useMatch'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { shotsOf } from '../../domain/shotchart'
import { listPlayers, listTeams } from '../../persistence/repositories'
import { periodLength, seedSeconds } from '../../domain/ids'
import type { Match, Player, ScoreKind, ShotSpot, StatKind, FoulType } from '../../domain/types'
import { Eye, Pencil, RotateCcw, X } from 'lucide-react'

/* L'accent de notre équipe, et c'est la marque — pas un jeton `--team-a` à part.
   Celui-là valait un presque-noir en thème clair, ce qui donnait au panneau de
   l'effectif un filet supérieur noir, des anneaux noirs autour des numéros et des
   points noirs : rien qui ressemblât au reste de l'application. Une seule équipe
   est détaillée sur cet écran, donc « notre couleur » et « la couleur du produit »
   sont la même chose et n'ont pas à être deux jetons. */
const TEAM_A = C.brand
const OPP_POINTS: { k: ScoreKind; n: number }[] = [{ k: 'lf', n: 1 }, { k: '2int', n: 2 }, { k: '3', n: 3 }]

/**
 * Table de marque du match : notre effectif est détaillé joueur par joueur,
 * l'adversaire se résume à un score saisi globalement.
 */
export function LiveMatch({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const trad = useT()
  const navigate = useNavigate()
  const { can, guard } = useAuth()
  const { match, dispatch, dispatchMany, undo, removeLast, finish, error } = useMatch(matchId)
  const [askFinish, setAskFinish] = useState(false)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<{ A: string; B: string }>({ A: trad('nav.monEquipe'), B: trad('match.adversaire') })
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
      setTeamNames({ A: byId[match.meta.clubId] ?? trad('nav.monEquipe'), B: byId[match.meta.opponentId] ?? trad('match.adversaire') })
    })
  }, [match?.meta.clubId, match?.meta.opponentId, trad])

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

  /* Le suivi spectateur n'a plus rien à publier depuis ici. Il lit la rencontre
     dans la base, où la file d'attente la porte déjà, et le serveur assemble le
     paquet. Cet écran republiait l'état entier à chaque évènement — donc deux
     chemins d'écriture pour une même donnée, et deux façons de se contredire. */

  if (!match || !ls)
    return <div className="grid min-h-dvh place-items-center text-muted-foreground">{trad('commun.chargement')}</div>

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
    /* `h-dvh`, pas `min-h-full` : le tableau d'affichage et le chrono ne défilent
       plus jamais hors de l'écran, seul l'effectif défile — et il ne défile plus
       guère, puisque la coquille ne lui prend plus ses cent pixels. */
    <div className="flex h-dvh flex-col overflow-hidden" style={{ background: C.frame, color: C.text }}>
      {/* Le bandeau est une carte, et non plus une surface qui refuse le thème : un
          `--scoreboard` charbon en dur posait un rectangle noir en haut d'une
          application claire. Il garde sa présence par le plan (la carte est le point
          haut) et par le filet qui le sépare de l'écran, pas par une valeur qui
          n'appartient qu'à lui. */}
      <header className="shrink-0 px-4 pb-4 pt-3 sm:px-6" style={{ background: C.card, color: C.text, borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          {/* La sortie voyage avec la frise des périodes, pas avec les actions :
              quitter n'est pas une action de saisie, et la ligne des périodes a la
              place que celle des boutons n'a plus. Le match n'est pas terminé pour
              autant — on revient à sa fiche, et « Reprendre » ramène ici. */}
          <div className="flex items-center gap-2">
            <Link to={`/match/${match.id}`} aria-label={trad('live.quitter')} title={trad('live.quitter')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--c-card2)] text-base font-black text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]"><X className="h-5 w-5" strokeWidth={2.5} /></Link>
            <PeriodStrip current={ls.period} />
          </div>
          {/* `flex-wrap` : cinq commandes larges d'un doigt ne tiennent pas toujours
              sur une ligne de téléphone. Elles passent à la ligne — elles ne sortent
              plus de l'écran, comme « Terminer » le faisait, hors d'atteinte. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to={`/match/${match.id}/watch`} target="_blank" aria-label={trad('live.suivi')} title={trad('live.suivi')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--c-card2)] text-base text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]"><Eye className="h-[18px] w-[18px]" strokeWidth={2} /></Link>
            <SbButton onClick={undo} title={trad('live.annulerTitre')}>{trad('live.annuler')}</SbButton>
            <SbButton onClick={nextPeriod} title={trad('live.periodeTitre')}>{trad('live.periode')}</SbButton>
            {/* Un écart avant l'irréversible. « Terminer » fige le score ; il était
                à huit pixels de « Période suivante », soit la largeur d'un pouce
                mal posé. */}
            <span className="w-3 shrink-0" aria-hidden />
            <SbButton onClick={() => setAskFinish(true)} danger>{trad('live.terminer')}</SbButton>
          </div>
        </div>

        <div className="mx-auto mt-3 grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-1 overflow-hidden sm:gap-6">
          {/* Nous en encre, l'adversaire en accent : « nous ou eux », et les deux
              jetons basculent avec le thème au lieu de porter du blanc en dur. */}
          <ScoreSide align="right" color={C.text} name={teamNames.A} score={ls.score.a} lead={ls.score.a > ls.score.b} />
          <GameClock running={ls.clockRunning} seconds={seconds} onToggle={toggleClock} />
          <ScoreSide align="left" color={C.accent} name={teamNames.B} score={ls.score.b} lead={ls.score.b > ls.score.a} />
        </div>

        {/* Les corrections de chrono sur leur propre ligne, et non dans la colonne
            centrale de la grille : à cinq boutons larges d'un doigt, cette colonne
            devenait plus large que l'écran et poussait les deux scores hors du
            cadre. Le score passe avant le réglage. */}
        <div className="mx-auto mt-2.5 flex max-w-4xl flex-wrap items-center justify-center gap-1" title={trad('live.corrigerChrono')}>
          <ClockAdjust onClick={() => setSeconds((s) => clampClock(s - 10))}>−10s</ClockAdjust>
          <ClockAdjust ecart onClick={() => setSeconds((s) => clampClock(s - 1))}>−1s</ClockAdjust>
          <ClockAdjust onClick={() => setSeconds((s) => clampClock(s + 1))}>+1s</ClockAdjust>
          <ClockAdjust ecart onClick={() => setSeconds((s) => clampClock(s + 10))}>+10s</ClockAdjust>
          <ClockAdjust ecart onClick={() => setEditClock(true)}><Pencil className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2} />{trad('live.editer')}</ClockAdjust>
        </div>
      </header>

      {error && <div className="shrink-0 bg-[var(--c-danger-bg)] py-1.5 text-center text-sm font-semibold text-[var(--c-danger)]">{error}</div>}

      {/* SCORE ADVERSE : global, sans joueurs. Une seule ligne — la mention
          « score global, pas de détail joueur » expliquait à chaque match un fait
          qu'on apprend au premier, et la troisième ligne qu'elle imposait au
          téléphone se prenait sur l'effectif. */}
      <div className="mx-auto mt-2 flex w-full max-w-4xl shrink-0 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 sm:mt-4 sm:px-4">
        <span className="min-w-0 truncate text-sm font-extrabold uppercase tracking-tight">{teamNames.B}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {OPP_POINTS.map(({ k, n }) => (
            <button key={k} onClick={() => oppScore(k)} aria-label={trad('live.ajouterPoints', { count: n, equipe: teamNames.B })}
              className="nums h-11 min-w-11 rounded-lg bg-[var(--c-card2)] px-3 text-sm font-black text-[var(--c-text)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90">
              +{n}
            </button>
          ))}
          <button onClick={removeOppScore} aria-label={trad('live.retirerPanier', { equipe: teamNames.B })}
            className="h-11 w-11 rounded-lg bg-[var(--c-card2)] text-sm font-bold text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90">
            <RotateCcw className="mx-auto h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* `min-h-0` : sans lui, un enfant flexible refuse de se laisser comprimer
          sous la taille de son contenu et l'effectif repousserait le tableau
          d'affichage hors de l'écran au lieu de défiler dans sa propre boîte. */}
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
      {/* On ne quitte la rencontre que si elle est réellement clôturée. `finish()`
          renvoyait `void` et l'on partait quoi qu'il arrive : une écriture en échec
          faisait sortir vers une fiche annonçant un match terminé qui ne l'était pas.
          En cas d'échec, on reste, et le bandeau d'erreur au-dessus l'explique. */}
      <ConfirmDialog open={askFinish} onClose={() => setAskFinish(false)} onConfirm={async () => { if (await finish()) onFinish() }}
        title={trad('live.terminerTitre')} message={trad('live.terminerTexte')} confirmLabel={trad('live.terminer')} danger />
      <SubstitutionDialog open={sub} onClose={() => setSub(false)}
        onCourtPlayers={onCourt()} benchPlayers={bench()}
        onSubmit={(playerOutId, playerInId) => dispatch({ type: 'SUBSTITUTION', team: 'A', playerOutId, playerInId, period: ls.period, gameClock: seconds })} />
    </div>
  )
}
