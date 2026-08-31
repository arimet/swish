import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlayer, getTeam, listMatches } from '../../persistence/repositories'
import { playerStats } from '../../domain/boxscore'
import { playingTimes } from '../../domain/playingtime'
import { playerCareer, ageAt } from '../../domain/career'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
import { fmt } from '../components/GameClock'
import { useT } from '../../i18n'
import { C, NumBadge, Panel, TeamBadge, bd, fmtDate , useLeagueLabel } from '../olive/kit'
import { useAuth } from '../../app/auth'
import type { Match, Player, Team } from '../../domain/types'

/** Per-game average, to one decimal. `—` when no game has been played: a player who
 *  has not played does not have "0.0 assists", they have no average. */
const perGame = (total: number, games: number) =>
  games ? (total / games).toFixed(1).replace('.', ',') : '—'

export function PlayerDetail() {
  const translate = useT()
  const champ = useLeagueLabel()
  const { id } = useParams<{ id: string }>()
  const { playerId } = useAuth()
  const [player, setPlayer] = useState<Player | null | undefined>(undefined)
  const [team, setTeam] = useState<Team | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [openMatch, setOpenMatch] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getPlayer(id)
      .then(async (p) => {
        if (cancelled) return
        if (!p) { setPlayer(null); return }
        const [t, all] = await Promise.all([getTeam(p.teamId), listMatches()])
        if (cancelled) return
        setTeam(t ?? null)
        // Games where the player is on the roster and that have started.
        setMatches(all.filter((m) => m.status !== 'setup' && m.roster.includes(id)))
        setPlayer(p)
      })
    return () => { cancelled = true }
  }, [id])

  if (!id) return null
  if (player === undefined) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (player === null)
    return (
      <div className="p-6">
        <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
          {translate('player.notFound')} <Link to="/teams" className="font-bold" style={{ color: C.accent }}>{translate('team.backToTeams')}</Link>
        </p>
      </div>
    )

  const lineOf = (m: Match) => playerStats(m).find((s) => s.playerId === id)
  const career = playerCareer(matches, id)
  const shotsCareer = shotsOf(matches, id)
  const pct = shootingPct(shotsCareer)
  const played = career.games
  const ordered = [...matches].sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? ''))

  return (
    <div className="p-6">
      <Link to={team ? `/teams/${team.id}` : '/teams'} className="inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>
        ← {team?.name ?? translate('nav.teams')}
      </Link>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <NumBadge n={player.number} size="h-12 w-12 rounded-xl text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <span className="truncate">{player.lastName} {player.firstName}</span>
            {/* Identity highlights, it protects nothing: the record is identical for
                everyone, this mention aside. */}
            {playerId === player.id && (
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-black uppercase tracking-wide"
                style={{ background: C.accentBg, color: C.accent }}>{translate('player.thisIsYou')}</span>
            )}
          </h1>
          {team && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: C.muted }}>
              <span className="flex items-center gap-2"><TeamBadge id={team.id} name={team.name} size="h-5 w-5 text-[12px]" />{team.name}</span>
              {player.birthDate && <span>· {ageAt(player.birthDate, new Date())} ans</span>}
              {player.height && <span>· {player.height} cm</span>}
            </p>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={translate('team.games')} value={String(played)} hint={translate('team.played')} />
        <StatCard label={translate('player.pointsPerGame')} value={perGame(career.points, played)} hint={translate('team.inTotal', { n: career.points })} />
        <StatCard label={translate('player.shootingPct')} value={pct.fg === null ? '—' : `${pct.fg} %`} hint={translate('count.locatedShot', { count: shotsCareer.length })} accent={C.accent} />
        <StatCard label={translate('player.threePct')} value={pct.three === null ? '—' : `${pct.three} %`} hint={translate('player.overTheCareer')} />
        <StatCard label={translate('player.avgCourtTime')} value={played ? fmt(Math.round(career.seconds / played)) : '—'} hint={translate('player.perGameHint')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <Panel title={translate('player.careerHotZone')}>
            {shotsCareer.length === 0 ? (
              <Empty>{translate('dashboard.noShot')}</Empty>
            ) : (
              <ShotChart shots={shotsCareer} />
            )}
          </Panel>

          <Panel title={translate('player.statistics')}>
            <div className="mb-1 flex items-center justify-between text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>
              <span>{translate('player.perGame')}</span>
              <span className="flex gap-4"><span className="w-8 text-right">{translate('player.total')}</span><span className="w-14 text-right">{translate('player.average')}</span></span>
            </div>
            <StatRow label={translate('player.assists')} total={career.assists} games={played} />
            <StatRow label={translate('player.offRebounds')} total={career.offRebounds} games={played} />
            <StatRow label={translate('player.defRebounds')} total={career.defRebounds} games={played} />
            <StatRow label={translate('player.blocks')} total={career.blocks} games={played} />
            <StatRow label={translate('player.fouls')} total={career.fouls} games={played} />
            <p className="mb-1 mt-4 text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('player.breakdown')}</p>
            <StatRow label={translate('player.twosInside')} total={career.twoInside} games={played} />
            <StatRow label={translate('player.twosOutside')} total={career.twoOutside} games={played} />
            <StatRow label={translate('player.threes')} total={career.threes} games={played} />
            <StatRow label={translate('player.freeThrows')} total={career.freeThrows} games={played} />
          </Panel>
        </div>

        <Panel title={translate('team.games')}>
          {ordered.length === 0 ? (
            <Empty>{translate('player.noGamePlayed')}</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ordered.map((m) => {
                const s = lineOf(m)
                const shots = shotsOf([m], id)
                const isOpen = openMatch === m.id
                return (
                  <li key={m.id} className="rounded-xl" style={{ background: C.panel }}>
                    <button onClick={() => setOpenMatch(isOpen ? null : m.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{champ(m.meta)}</span>
                      <span className="shrink-0 text-[12px] font-semibold" style={{ color: C.faint }}>{fmtDate(m.meta.date).long || '—'}</span>
                      <span className="nums w-14 shrink-0 text-right text-sm font-black">{s?.points ?? 0} pts</span>
                      <span style={{ color: C.faint }}>{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 py-3" style={{ borderColor: C.border }}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <ul className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-[12px] font-semibold" style={{ color: C.muted }}>
                            <li className="col-span-2 font-bold" style={{ color: C.text }}>{translate('count.pt', { count: s?.points ?? 0 })}</li>
                            <li>{translate('count.madeShot', { count: s?.fieldGoalsMade ?? 0 })}</li>
                            <li>{translate('count.miss', { count: s?.misses ?? 0 })}</li>
                            <li>{translate('count.assist', { count: s?.assists ?? 0 })}</li>
                            <li>{translate('count.block', { count: s?.blocks ?? 0 })}</li>
                            <li>{translate('count.offRebound', { count: s?.offRebounds ?? 0 })}</li>
                            <li>{translate('count.defRebound', { count: s?.defRebounds ?? 0 })}</li>
                            <li>{translate('count.foul', { count: s?.fouls ?? 0 })}</li>
                            <li>{fmt(playingTimes(m).get(id) ?? 0)} de jeu</li>
                          </ul>
                          <div className="shrink-0 sm:w-44">
                            {shots.length === 0 ? <Empty>{translate('player.noShotInGame')}</Empty> : <ShotChart shots={shots} minAttempts={1} />}
                          </div>
                        </div>
                        <Link to={`/match/${m.id}/summary`} className="mt-2 inline-block text-xs font-bold" style={{ color: C.accent }}>
                          {translate('player.viewSheet')}
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function StatRow({ label, total, games }: { label: string; total: number; games: number }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 text-sm last:border-b-0" style={{ borderColor: C.border }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span className="flex gap-4">
        <span className="nums w-8 text-right font-bold">{total}</span>
        <span className="nums w-14 text-right text-xs font-semibold" style={{ color: C.faint }}>{perGame(total, games)}</span>
      </span>
    </div>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
