import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getMatch, listPlayers, listTeams } from '../../persistence/repositories'
import { syncEnabled, fetchBundle, subscribeBundle, type SyncBundle } from '../../app/sync'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { teamTotals } from '../../domain/totals'
import { periodLength } from '../../domain/ids'
import { fmt } from '../components/GameClock'
import { C, TeamBadge, teamColor, champLabel } from '../olive/kit'
import type { Match, Player, TeamSide } from '../../domain/types'

/** Page de suivi en direct pour les spectateurs (lecture seule, plein écran).
 * Rafraîchit l'état depuis la base locale ; conçue pour être projetée. */
export function SpectatorMatch({ matchId }: { matchId: string }) {
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [names, setNames] = useState<Record<TeamSide, string>>({ A: 'Locaux', B: 'Visiteurs' })
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Mode distant (multi-appareils) : flux temps réel SSE + repli polling.
  useEffect(() => {
    if (!syncEnabled()) return
    const apply = (b: SyncBundle) => {
      setMatch(b.match)
      const map: Record<string, Player> = {}
      for (const p of b.players) map[p.id] = p
      setPlayers(map)
      setNames(b.teamNames)
    }
    fetchBundle(matchId).then((b) => { if (b) apply(b) })
    return subscribeBundle(matchId, apply)
  }, [matchId])

  // Mode local (même appareil) : lecture de la base locale.
  useEffect(() => {
    if (syncEnabled()) return
    let stop = false
    const load = async () => { const m = await getMatch(matchId); if (!stop) setMatch(m ?? null) }
    load()
    const iv = window.setInterval(load, 1500)
    return () => { stop = true; clearInterval(iv) }
  }, [matchId])

  // Tick du chrono simulé (tant que le chrono tourne).
  useEffect(() => {
    if (!match || match.status !== 'live' || !liveState(match).clockRunning) return
    const iv = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(iv)
  }, [match])

  useEffect(() => {
    if (syncEnabled() || !match) return
    Promise.all([listPlayers(match.meta.teamAId), listPlayers(match.meta.teamBId), listTeams()]).then(([pa, pb, teams]) => {
      const map: Record<string, Player> = {}
      for (const p of [...pa, ...pb]) map[p.id] = p
      setPlayers(map)
      setNames({
        A: teams.find((t) => t.id === match.meta.teamAId)?.name ?? 'Locaux',
        B: teams.find((t) => t.id === match.meta.teamBId)?.name ?? 'Visiteurs',
      })
    })
  }, [match?.meta.teamAId, match?.meta.teamBId])

  if (match === undefined) return <Screen><p style={{ color: C.muted }}>Chargement…</p></Screen>
  if (match === null) return <Screen><p style={{ color: C.muted }}>Rencontre introuvable.</p></Screen>

  const ls = liveState(match)
  const live = match.status === 'live'
  const finished = match.status === 'finished'

  // Chrono simulé : on repart du dernier évènement (chrono + horodatage réel) et
  // on décompte en local tant que le chrono tourne (wallClock réel requis, pas le seed).
  const lastEv = match.events[match.events.length - 1]
  const anchorClock = lastEv?.gameClock ?? periodLength(ls.period)
  const anchorWall = lastEv?.wallClock ?? 0
  const canSimulate = ls.clockRunning && anchorWall > 1e12
  const displaySec = canSimulate ? Math.max(0, Math.round(anchorClock - (nowMs - anchorWall) / 1000)) : anchorClock
  const periodLabel = ls.period <= 4 ? `Q${ls.period}` : `P${ls.period - 4}`

  return (
    <Screen>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:py-10">
        <div className="mb-5 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold" style={{ color: C.faint }}>← Swish</Link>
          <span className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide"
            style={live ? { background: C.greenBg, color: C.green } : finished ? { background: 'rgba(255,255,255,0.08)', color: C.muted } : { background: C.amberBg, color: C.amber }}>
            {live && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: C.green }} />}
            {live ? 'En direct' : finished ? 'Terminé' : 'À venir'}
          </span>
        </div>

        <p className="text-center text-[12px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{champLabel(match.meta)}</p>

        {/* SCOREBOARD (blocs équipe : lisible sur mobile) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-6">
          <TeamScore id={match.meta.teamAId} name={names.A} score={ls.score.a} />
          <TeamScore id={match.meta.teamBId} name={names.B} score={ls.score.b} />
        </div>
        <div className="mt-3 flex flex-col items-center gap-1">
          <span className="nums rounded-lg px-3.5 py-1.5 text-base font-black tabular-nums" style={{ background: C.card, color: finished ? C.muted : C.text, border: `1px solid ${C.border}` }}>
            {finished ? 'FINAL' : `${periodLabel} · ${fmt(displaySec)}`}
          </span>
          {!finished && ls.clockRunning && !canSimulate && (
            <span className="text-[10px] font-semibold" style={{ color: C.faint }}>chrono mis à jour à chaque action</span>
          )}
        </div>

        {/* BANDEAU FAUTES / TM (aucune faute/TM adverse saisissable en mode solo) */}
        <div className={`mt-5 grid gap-3 ${match.meta.solo ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <MetaRow label={names.A} fouls={ls.teamFoulsThisPeriod.A} bonus={ls.bonus.A} to={ls.timeoutsRemaining.A} />
          {!match.meta.solo && <MetaRow label={names.B} fouls={ls.teamFoulsThisPeriod.B} bonus={ls.bonus.B} to={ls.timeoutsRemaining.B} />}
        </div>

        {/* STATS JOUEURS */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatList side="A" name={names.A} match={match} players={players} />
          {match.meta.solo ? (
            <SoloOpponentPanel id={match.meta.teamBId} name={names.B} score={ls.score.b} />
          ) : (
            <StatList side="B" name={names.B} match={match} players={players} />
          )}
        </div>

        <p className="mt-6 text-center text-[11px]" style={{ color: C.faint }}>Mise à jour automatique · suivi en direct</p>
      </div>
    </Screen>
  )
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

function TeamScore({ id, name, score }: { id: string; name: string; score: number }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamBadge id={id} name={name} size="h-10 w-10 text-xs sm:h-14 sm:w-14 sm:text-sm" />
      <span className="line-clamp-2 min-h-[2.4em] w-full text-sm font-extrabold leading-tight sm:min-h-0 sm:text-lg">{name}</span>
      <span className="nums text-5xl font-black leading-none tabular-nums sm:text-7xl" style={{ color: teamColor(id) }}>{score}</span>
    </div>
  )
}

function MetaRow({ label, fouls, bonus, to }: { label: string; fouls: number; bonus: boolean; to: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <span className="truncate text-[11px] font-bold uppercase" style={{ color: C.muted }}>{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold">
        {bonus && <span className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase text-white" style={{ background: '#ef4444' }}>Bonus</span>}
        <span style={{ color: C.faint }}>Fautes <span style={{ color: C.text }}>{fouls}</span></span>
        <span style={{ color: C.faint }}>TM <span style={{ color: C.text }}>{to}</span></span>
      </span>
    </div>
  )
}

/** Mode « une seule équipe » côté spectateur : effectif adverse vide, donc pas de
 *  tableau joueur possible — on affiche à la place le score réel (saisi globalement)
 *  en gros, plutôt qu'un tableau vide sous un total à 0. */
function SoloOpponentPanel({ id, name, score }: { id: string; name: string; score: number }) {
  return (
    <section className="flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-8 text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <h3 className="text-sm font-extrabold uppercase tracking-wide">{name}</h3>
      <span className="nums text-6xl font-black leading-none tabular-nums" style={{ color: teamColor(id) }}>{score}</span>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Score saisi globalement</p>
    </section>
  )
}

function StatList({ side, name, match, players }: { side: TeamSide; name: string; match: Match; players: Record<string, Player> }) {
  const stats = [...playerStats(match, side)].sort((a, b) => b.points - a.points || a.fouls - b.fouls)
  const t = teamTotals(match, side).team
  const top = stats[0]?.points ?? 0
  const active = stats.filter((s) => s.points || s.fouls || s.assists || s.offRebounds || s.defRebounds || s.blocks)
  const rows = active.length > 0 ? active : stats.slice(0, 5)
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(side === 'A' ? match.meta.teamAId : match.meta.teamBId) }} />
        <h3 className="text-sm font-extrabold uppercase tracking-wide">{name}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase" style={{ color: C.faint }}>
              <th className="px-3 py-2 text-left">N°</th><th className="px-2 py-2 text-left">Joueur</th>
              <Sth>Pts</Sth><Sth>3PT</Sth><Sth>PD</Sth><Sth>Reb</Sth><Sth>CT</Sth><Sth>F</Sth>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const p = players[s.playerId]
              return (
                <tr key={s.playerId} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="px-3 py-2 font-black tabular-nums">{p?.number ?? '—'}</td>
                  <td className="px-2 py-2 font-semibold">{p ? `${p.lastName} ${p.firstName}` : s.playerId}</td>
                  <td className="px-3 py-2 text-center font-black tabular-nums" style={{ color: s.points > 0 && s.points === top ? C.orange : s.points > 0 ? C.text : C.faint }}>{s.points}</td>
                  <Std>{s.threes}</Std><Std>{s.assists}</Std><Std>{s.offRebounds + s.defRebounds}</Std><Std>{s.blocks}</Std>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: s.fouls >= 5 ? C.pink : C.muted }}>{s.fouls}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>Pas encore de statistiques.</td></tr>}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
              <td className="px-3 py-2"></td><td className="px-2 py-2 text-[12px] font-black uppercase">Total</td>
              <td className="px-3 py-2 text-center font-black tabular-nums" style={{ color: teamColor(side === 'A' ? match.meta.teamAId : match.meta.teamBId) }}>{t.points}</td>
              <Std b>{t.threes}</Std><Std b>{t.assists}</Std><Std b>{t.offRebounds + t.defRebounds}</Std><Std b>{t.blocks}</Std><Std b>{t.fouls}</Std>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
function Sth({ children }: { children: ReactNode }) { return <th className="px-3 py-2 text-center">{children}</th> }
function Std({ children, b }: { children: ReactNode; b?: boolean }) {
  return <td className="px-3 py-2 text-center tabular-nums" style={{ color: b ? C.text : C.muted, fontWeight: b ? 800 : 500 }}>{children}</td>
}
