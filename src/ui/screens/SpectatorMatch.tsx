import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { fetchBundle, subscribeBundle, type SpectatorBundle } from '../../app/spectator'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { teamTotals } from '../../domain/totals'
import { periodLength } from '../../domain/ids'
import { shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
import { fmt } from '../components/GameClock'
import { C, TeamBadge , useLeagueLabel } from '../olive/kit'
import { useT } from '../../i18n'
import type { Match, Player, TeamSide } from '../../domain/types'

/** The live view for spectators (read-only, full screen). It reads the public
 * bundle — the game, the numbers and the names, nothing more — over the real-time
 * stream, and is designed to be projected. */
export function SpectatorMatch({ matchId }: { matchId: string }) {
  const translate = useT()
  const champ = useLeagueLabel()
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  // Placeholders until the real names arrive: the bundle replaces them within the
  // first frames, but a projected screen must never show an empty label.
  const [names, setNames] = useState<Record<TeamSide, string>>(() => ({ A: translate('match.home'), B: translate('match.away') }))
  const [nowMs, setNowMs] = useState(() => Date.now())
  // One shot chart open across the whole screen: it is often projected in the hall,
  // and two charts at once would make it unreadable from a distance.
  const [openShotsId, setOpenShotsId] = useState<string | null>(null)

  // The real-time SSE stream, with polling as a fallback.
  useEffect(() => {
    const apply = (b: SpectatorBundle) => {
      setMatch(b.match)
      const map: Record<string, Player> = {}
      for (const p of b.players) map[p.id] = p
      setPlayers(map)
      setNames(b.teamNames)
    }
    // `null` on a first fetch that finds nothing: without it a stale link would sit
    // on "Loading…" for ever, and a projected screen would say nothing at all.
    fetchBundle(matchId).then((b) => { if (b) apply(b); else setMatch(null) })
    return subscribeBundle(matchId, apply)
  }, [matchId])

  // The simulated clock's tick (for as long as the clock is running).
  useEffect(() => {
    if (!match || match.status !== 'live' || !liveState(match).clockRunning) return
    const iv = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(iv)
  }, [match])

  if (match === undefined) return <Screen><p style={{ color: C.muted }}>{translate('common.loading')}</p></Screen>
  if (match === null) return <Screen><p style={{ color: C.muted }}>{translate('preview.notFound')}</p></Screen>

  const ls = liveState(match)
  const live = match.status === 'live'
  const finished = match.status === 'finished'

  // Simulated clock: we start from the last event (its clock plus its real
  // timestamp) and count down locally while the clock runs. A real `wallClock` is
  // required — the seed's synthetic ones would run the countdown from nonsense.
  const lastEv = match.events[match.events.length - 1]
  const anchorClock = lastEv?.gameClock ?? periodLength(ls.period)
  const anchorWall = lastEv?.wallClock ?? 0
  const canSimulate = ls.clockRunning && anchorWall > 1e12
  const displaySec = canSimulate ? Math.max(0, Math.round(anchorClock - (nowMs - anchorWall) / 1000)) : anchorClock
  const periodLabel = ls.period <= 4 ? `Q${ls.period}` : `P${ls.period - 4}`

  return (
    <Screen>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:py-10">
        {/* No back link to "/": this page is a share destination (a link projected
            or sent to spectators with no club set), not a way into the application
            behind the club gate. */}
        <div className="mb-5 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-black uppercase tracking-wide"
            style={live ? { background: C.greenFill, color: C.onGreen } : finished ? { background: C.neutralBg, color: C.muted } : { background: C.amberBg, color: C.amber }}>
            {live && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: C.green }} />}
            {live ? translate('dashboard.live') : finished ? translate('spectator.finished') : translate('spectator.upcoming')}
          </span>
        </div>

        <p className="text-center text-[12px] font-bold" style={{ color: C.muted }}>{champ(match.meta)}</p>

        {/* SCOREBOARD (team blocks: legible on a phone) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-6">
          {/* Us in ink, the opposition in accent: the same two tokens as the scorer's
              table, so a spectator moving between screens reads the same code. These
              are **theme** tokens, not the banner's old `--sb-*`: those were a
              hard-coded white, correct on a charcoal banner and illegible here, where
              the score sits on the page's light background. Borrowing one surface's
              colours to use them on another is what produced a white score on
              white. */}
          <TeamScore id={match.meta.clubId} name={names.A} score={ls.score.a} color={C.text} />
          <TeamScore id={match.meta.opponentId} name={names.B} score={ls.score.b} color={C.accent} />
        </div>
        <div className="mt-3 flex flex-col items-center gap-1">
          <span className="nums rounded-lg px-3.5 py-1.5 text-base font-black tabular-nums" style={{ background: C.card, color: finished ? C.muted : C.text, border: `1px solid ${C.border}` }}>
            {finished ? translate('summary.final').toUpperCase() : `${periodLabel} · ${fmt(displaySec)}`}
          </span>
          {!finished && ls.clockRunning && !canSimulate && (
            <span className="text-[12px] font-semibold" style={{ color: C.faint }}>{translate('spectator.clockNote')}</span>
          )}
        </div>

        {/* FOULS / TIMEOUTS BAR (no opposition foul or timeout can be recorded: there
            is no roster on that side) */}
        <div className="mt-5 grid grid-cols-1 gap-3">
          <MetaRow label={names.A} fouls={ls.teamFoulsThisPeriod.A} bonus={ls.bonus.A} to={ls.timeoutsRemaining.A} />
        </div>

        {/* PLAYER STATS */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatList name={names.A} match={match} players={players}
            openId={openShotsId} onToggle={setOpenShotsId} />
          <OpponentPanel name={names.B} score={ls.score.b} />
        </div>

        <p className="mt-6 text-center text-[12px]" style={{ color: C.faint }}>{translate('spectator.autoRefresh')}</p>
      </div>
    </Screen>
  )
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

/**
 * One side of the spectator scoreboard.
 *
 * The score does **not** carry a hue hashed from the team's id. That device is right
 * for telling six crests apart in a list, and wrong here: on a scoreboard the question
 * is not "which of the six teams" but "us or them", and a hash answers it with a
 * crimson and a navy foreign to the charter. The two tokens that say exactly that
 * already exist for the scorer's
 * table: ours in ink, the opposition in accent. The crest keeps its club colour —
 * that is where identity means something.
 */
function TeamScore({ id, name, score, color }: { id: string; name: string; score: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamBadge id={id} name={name} size="h-10 w-10 text-xs sm:h-14 sm:w-14 sm:text-sm" />
      <span className="line-clamp-2 min-h-[2.4em] w-full text-sm font-extrabold leading-tight sm:min-h-0 sm:text-lg">{name}</span>
      <span className="nums text-5xl font-black leading-none tabular-nums sm:text-7xl" style={{ color: color }}>{score}</span>
    </div>
  )
}

function MetaRow({ label, fouls, bonus, to }: { label: string; fouls: number; bonus: boolean; to: number }) {
  const translate = useT()
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <span className="truncate text-[12px] font-bold" style={{ color: C.muted }}>{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-[12px] font-bold">
        {bonus && <span className="rounded-md px-1.5 py-0.5 text-[12px] font-black uppercase" style={{ background: C.dangerFill, color: C.onDanger }}>{translate('panel.bonus')}</span>}
        <span style={{ color: C.faint }}>{translate('panel.fouls')} <span style={{ color: C.text }}>{fouls}</span></span>
        <span style={{ color: C.faint }}>{translate('spectator.to')} <span style={{ color: C.text }}>{to}</span></span>
      </span>
    </div>
  )
}

/** On the spectator side the opposition has no roster, so no player table is
 *  possible — we show their real score (entered as a total) in large type instead of
 *  an empty table under a zero. */
function OpponentPanel({ name, score }: { name: string; score: number }) {
  const translate = useT()
  return (
    <section className="flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-8 text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <h3 className="text-sm font-extrabold uppercase tracking-wide">{name}</h3>
      <span className="nums text-6xl font-black leading-none tabular-nums" style={{ color: C.accent }}>{score}</span>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('spectator.totalScore')}</p>
    </section>
  )
}

function StatList({ name, match, players, openId, onToggle }: {
  name: string; match: Match; players: Record<string, Player>
  openId: string | null; onToggle: (id: string | null) => void
}) {
  const translate = useT()
  const stats = [...playerStats(match)].sort((a, b) => b.points - a.points || a.fouls - b.fouls)
  const t = teamTotals(match).team
  const top = stats[0]?.points ?? 0
  const active = stats.filter((s) => s.points || s.fouls || s.assists || s.offRebounds || s.defRebounds || s.blocks)
  const rows = active.length > 0 ? active : stats.slice(0, 5)
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.brand }} />
        <h3 className="text-sm font-extrabold uppercase tracking-wide">{name}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[12px] font-bold uppercase" style={{ color: C.faint }}>
              <th className="px-3 py-2 text-left">{translate('team.number')}</th><th className="px-2 py-2 text-left">{translate('summary.thPlayer')}</th>
              <Sth>{translate('summary.thPts')}</Sth><Sth>{translate('summary.th3pt')}</Sth><Sth>{translate('summary.thAst')}</Sth><Sth>{translate('spectator.reb')}</Sth><Sth>{translate('summary.thBlk')}</Sth><Sth>{translate('spectator.pf')}</Sth>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const p = players[s.playerId]
              const label = p ? `${p.lastName} ${p.firstName}` : s.playerId
              const isOpen = openId === s.playerId
              const shots = isOpen ? shotsOf([match], s.playerId) : []
              return (
                <Fragment key={s.playerId}>
                  <tr style={{ borderTop: `1px solid ${C.border}`, background: isOpen ? C.panel : undefined }}>
                    <td className="px-3 py-2 font-black tabular-nums">{p?.number ?? '—'}</td>
                    <td className="px-2 py-2 font-semibold">
                      <button onClick={() => onToggle(isOpen ? null : s.playerId)} className="-my-1 py-1.5 text-left hover:underline">
                        {label} <span style={{ color: C.faint }}>{isOpen ? '▾' : '▸'}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center font-black tabular-nums" style={{ color: s.points > 0 && s.points === top ? C.accent : s.points > 0 ? C.text : C.faint }}>{s.points}</td>
                    <Std>{s.threes}</Std><Std>{s.assists}</Std><Std>{s.offRebounds + s.defRebounds}</Std><Std>{s.blocks}</Std>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: s.fouls >= 5 ? C.accent : C.muted }}>{s.fouls}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: C.panel }}>
                      <td colSpan={8} className="px-3 pb-4 pt-1">
                        {shots.length === 0
                          ? <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{translate('player.noShotInGame')}</p>
                          : <ShotChart shots={shots} minAttempts={1} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>{translate('spectator.noStats')}</td></tr>}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
              <td className="px-3 py-2"></td><td className="px-2 py-2 text-[12px] font-black uppercase">{translate('spectator.total')}</td>
              <td className="px-3 py-2 text-center font-black tabular-nums" style={{ color: C.accent }}>{t.points}</td>
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
