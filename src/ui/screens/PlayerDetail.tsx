import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlayer, getTeam, listMatches } from '../../persistence/repositories'
import { refresh as refreshRemote } from '../../persistence/remote'
import { playerStats } from '../../domain/boxscore'
import { playingTimes } from '../../domain/playingtime'
import { playerCareer, ageAt } from '../../domain/career'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
import { fmt } from '../components/GameClock'
import { C, bd, TeamBadge, champLabel, fmtDate } from '../olive/kit'
import { useAuth } from '../../app/auth'
import type { Match, Player, Team } from '../../domain/types'

/** Moyenne par rencontre, à une décimale. `—` quand aucune rencontre n'a été jouée :
 *  un joueur qui n'a pas joué n'a pas « 0,0 passe », il n'a pas de moyenne. */
const parMatch = (total: number, games: number) =>
  games ? (total / games).toFixed(1).replace('.', ',') : '—'

/** Accord au pluriel pour les petits décomptes affichés en toutes lettres. */
const plur = (n: number) => (n > 1 ? 's' : '')

export function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const { playerId } = useAuth()
  const [player, setPlayer] = useState<Player | null | undefined>(undefined)
  const [team, setTeam] = useState<Team | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [openMatch, setOpenMatch] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    refreshRemote()
      .then(() => getPlayer(id))
      .then(async (p) => {
        if (cancelled) return
        if (!p) { setPlayer(null); return }
        const [t, all] = await Promise.all([getTeam(p.teamId), listMatches()])
        if (cancelled) return
        setTeam(t ?? null)
        // Rencontres où le joueur figure à l'effectif et qui ont commencé.
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
          Joueur introuvable. <Link to="/teams" className="font-bold" style={{ color: C.accent }}>← Équipes</Link>
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
        ← {team?.name ?? 'Équipes'}
      </Link>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <span className="nums grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold" style={{ background: C.accentBg, color: C.accent }}>
          {player.number}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <span className="truncate">{player.lastName} {player.firstName}</span>
            {/* L'identité met en avant, elle ne protège rien : la fiche est
                identique pour tout le monde, à cette mention près. */}
            {playerId === player.id && (
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wide"
                style={{ background: C.accentBg, color: C.accent }}>C’est vous</span>
            )}
          </h1>
          {team && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: C.muted }}>
              <span className="flex items-center gap-2"><TeamBadge id={team.id} name={team.name} size="h-5 w-5 text-[8px]" />{team.name}</span>
              {player.birthDate && <span>· {ageAt(player.birthDate, new Date())} ans</span>}
              {player.height && <span>· {player.height} cm</span>}
            </p>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Rencontres" value={String(played)} hint="jouées" />
        <StatCard label="Points / match" value={parMatch(career.points, played)} hint={`${career.points} au total`} />
        <StatCard label="Réussite aux tirs" value={pct.fg === null ? '—' : `${pct.fg} %`} hint={`${shotsCareer.length} tir${plur(shotsCareer.length)} localisé${plur(shotsCareer.length)}`} accent={C.accent} />
        <StatCard label="Réussite à 3 pts" value={pct.three === null ? '—' : `${pct.three} %`} hint="sur la carrière" />
        <StatCard label="Temps de jeu moyen" value={played ? fmt(Math.round(career.seconds / played)) : '—'} hint="par match" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Panel title="Hot zone — carrière">
            {shotsCareer.length === 0 ? (
              <Empty>Aucun tir localisé pour l’instant.</Empty>
            ) : (
              <ShotChart shots={shotsCareer} />
            )}
          </Panel>

          <Panel title="Statistiques">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>
              <span>Par match</span>
              <span className="flex gap-4"><span className="w-8 text-right">Cumul</span><span className="w-14 text-right">Moy.</span></span>
            </div>
            <StatRow label="Passes décisives" total={career.assists} games={played} />
            <StatRow label="Rebonds offensifs" total={career.offRebounds} games={played} />
            <StatRow label="Rebonds défensifs" total={career.defRebounds} games={played} />
            <StatRow label="Contres" total={career.blocks} games={played} />
            <StatRow label="Fautes" total={career.fouls} games={played} />
            <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Répartition des paniers</p>
            <StatRow label="2 pts intérieurs" total={career.twoInside} games={played} />
            <StatRow label="2 pts extérieurs" total={career.twoOutside} games={played} />
            <StatRow label="3 pts" total={career.threes} games={played} />
            <StatRow label="Lancers francs" total={career.freeThrows} games={played} />
          </Panel>
        </div>

        <Panel title="Rencontres">
          {ordered.length === 0 ? (
            <Empty>Aucune rencontre jouée.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ordered.map((m) => {
                const s = lineOf(m)
                const shots = shotsOf([m], id)
                const isOpen = openMatch === m.id
                return (
                  <li key={m.id} className="rounded-xl" style={{ background: C.panel }}>
                    <button onClick={() => setOpenMatch(isOpen ? null : m.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{champLabel(m.meta)}</span>
                      <span className="shrink-0 text-[11px] font-semibold" style={{ color: C.faint }}>{fmtDate(m.meta.date).long || '—'}</span>
                      <span className="nums w-14 shrink-0 text-right text-sm font-black">{s?.points ?? 0} pts</span>
                      <span style={{ color: C.faint }}>{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 py-3" style={{ borderColor: C.border }}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <ul className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-semibold" style={{ color: C.muted }}>
                            <li className="col-span-2 font-bold" style={{ color: C.text }}>{s?.points ?? 0} pt{plur(s?.points ?? 0)}</li>
                            <li>{s?.fieldGoalsMade ?? 0} tir{plur(s?.fieldGoalsMade ?? 0)} réussi{plur(s?.fieldGoalsMade ?? 0)}</li>
                            <li>{s?.misses ?? 0} manqué{plur(s?.misses ?? 0)}</li>
                            <li>{s?.assists ?? 0} passe{plur(s?.assists ?? 0)} décisive{plur(s?.assists ?? 0)}</li>
                            <li>{s?.blocks ?? 0} contre{plur(s?.blocks ?? 0)}</li>
                            <li>{s?.offRebounds ?? 0} rebond{plur(s?.offRebounds ?? 0)} off.</li>
                            <li>{s?.defRebounds ?? 0} rebond{plur(s?.defRebounds ?? 0)} déf.</li>
                            <li>{s?.fouls ?? 0} faute{plur(s?.fouls ?? 0)}</li>
                            <li>{fmt(playingTimes(m).get(id) ?? 0)} de jeu</li>
                          </ul>
                          <div className="shrink-0 sm:w-44">
                            {shots.length === 0 ? <Empty>Aucun tir localisé sur cette rencontre.</Empty> : <ShotChart shots={shots} minAttempts={1} />}
                          </div>
                        </div>
                        <Link to={`/match/${m.id}/summary`} className="mt-2 inline-block text-xs font-bold" style={{ color: C.accent }}>
                          Voir la feuille de match →
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
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function StatRow({ label, total, games }: { label: string; total: number; games: number }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 text-sm last:border-b-0" style={{ borderColor: C.border }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span className="flex gap-4">
        <span className="nums w-8 text-right font-bold">{total}</span>
        <span className="nums w-14 text-right text-xs font-semibold" style={{ color: C.faint }}>{parMatch(total, games)}</span>
      </span>
    </div>
  )
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{title}</p>
      {children}
    </section>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
