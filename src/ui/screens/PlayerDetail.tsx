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
import { useT } from '../../i18n'
import { C, NumBadge, Panel, TeamBadge, bd, fmtDate , useLeagueLabel } from '../olive/kit'
import { useAuth } from '../../app/auth'
import type { Match, Player, Team } from '../../domain/types'

/** Moyenne par rencontre, à une décimale. `—` quand aucune rencontre n'a été jouée :
 *  un joueur qui n'a pas joué n'a pas « 0,0 passe », il n'a pas de moyenne. */
const parMatch = (total: number, games: number) =>
  games ? (total / games).toFixed(1).replace('.', ',') : '—'

/** Accord au pluriel pour les petits décomptes affichés en toutes lettres. */

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
          {translate('joueur.introuvable')} <Link to="/teams" className="font-bold" style={{ color: C.accent }}>{translate('equipe.retourEquipes')}</Link>
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
        ← {team?.name ?? translate('nav.equipes')}
      </Link>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <NumBadge n={player.number} size="h-12 w-12 rounded-xl text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <span className="truncate">{player.lastName} {player.firstName}</span>
            {/* L'identité met en avant, elle ne protège rien : la fiche est
                identique pour tout le monde, à cette mention près. */}
            {playerId === player.id && (
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-black uppercase tracking-wide"
                style={{ background: C.accentBg, color: C.accent }}>{translate('joueur.cestVous')}</span>
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
        <StatCard label={translate('equipe.rencontres')} value={String(played)} hint={translate('equipe.jouees')} />
        <StatCard label={translate('joueur.pointsParMatch')} value={parMatch(career.points, played)} hint={translate('equipe.auTotal', { n: career.points })} />
        <StatCard label={translate('joueur.reussiteTirs')} value={pct.fg === null ? '—' : `${pct.fg} %`} hint={translate('compte.tirLocalise', { count: shotsCareer.length })} accent={C.accent} />
        <StatCard label={translate('joueur.reussite3pts')} value={pct.three === null ? '—' : `${pct.three} %`} hint={translate('joueur.surLaCarriere')} />
        <StatCard label={translate('joueur.tempsJeuMoyen')} value={played ? fmt(Math.round(career.seconds / played)) : '—'} hint={translate('joueur.parMatchHint')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <Panel title={translate('joueur.hotZoneCarriere')}>
            {shotsCareer.length === 0 ? (
              <Empty>{translate('bord.aucunTir')}</Empty>
            ) : (
              <ShotChart shots={shotsCareer} />
            )}
          </Panel>

          <Panel title={translate('joueur.statistiques')}>
            <div className="mb-1 flex items-center justify-between text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>
              <span>{translate('joueur.parMatch')}</span>
              <span className="flex gap-4"><span className="w-8 text-right">{translate('joueur.cumul')}</span><span className="w-14 text-right">{translate('joueur.moyenne')}</span></span>
            </div>
            <StatRow label={translate('joueur.passesDecisives')} total={career.assists} games={played} />
            <StatRow label={translate('joueur.rebondsOffensifs')} total={career.offRebounds} games={played} />
            <StatRow label={translate('joueur.rebondsDefensifs')} total={career.defRebounds} games={played} />
            <StatRow label={translate('joueur.contres')} total={career.blocks} games={played} />
            <StatRow label={translate('joueur.fautes')} total={career.fouls} games={played} />
            <p className="mb-1 mt-4 text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('joueur.repartition')}</p>
            <StatRow label={translate('joueur.deuxInterieurs')} total={career.twoInside} games={played} />
            <StatRow label={translate('joueur.deuxExterieurs')} total={career.twoOutside} games={played} />
            <StatRow label={translate('joueur.troisPts')} total={career.threes} games={played} />
            <StatRow label={translate('joueur.lancersFrancs')} total={career.freeThrows} games={played} />
          </Panel>
        </div>

        <Panel title={translate('equipe.rencontres')}>
          {ordered.length === 0 ? (
            <Empty>{translate('joueur.aucuneRencontreJouee')}</Empty>
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
                            <li className="col-span-2 font-bold" style={{ color: C.text }}>{translate('compte.pt', { count: s?.points ?? 0 })}</li>
                            <li>{translate('compte.tirReussi', { count: s?.fieldGoalsMade ?? 0 })}</li>
                            <li>{translate('compte.manque', { count: s?.misses ?? 0 })}</li>
                            <li>{translate('compte.passeDecisive', { count: s?.assists ?? 0 })}</li>
                            <li>{translate('compte.contre', { count: s?.blocks ?? 0 })}</li>
                            <li>{translate('compte.rebondOff', { count: s?.offRebounds ?? 0 })}</li>
                            <li>{translate('compte.rebondDef', { count: s?.defRebounds ?? 0 })}</li>
                            <li>{translate('compte.faute', { count: s?.fouls ?? 0 })}</li>
                            <li>{fmt(playingTimes(m).get(id) ?? 0)} de jeu</li>
                          </ul>
                          <div className="shrink-0 sm:w-44">
                            {shots.length === 0 ? <Empty>{translate('joueur.aucunTirRencontre')}</Empty> : <ShotChart shots={shots} minAttempts={1} />}
                          </div>
                        </div>
                        <Link to={`/match/${m.id}/summary`} className="mt-2 inline-block text-xs font-bold" style={{ color: C.accent }}>
                          {translate('joueur.voirFeuille')}
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
        <span className="nums w-14 text-right text-xs font-semibold" style={{ color: C.faint }}>{parMatch(total, games)}</span>
      </span>
    </div>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
