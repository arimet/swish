import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { getMatch, listPlayers, listTeams } from '../../persistence/repositories'
import { syncEnabled, fetchBundle, subscribeBundle, type SyncBundle } from '../../app/sync'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { teamTotals } from '../../domain/totals'
import { periodLength } from '../../domain/ids'
import { shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
import { fmt } from '../components/GameClock'
import { C, TeamBadge , useChampLabel } from '../olive/kit'
import { useT } from '../../i18n'
import type { Match, Player, TeamSide } from '../../domain/types'

/** Page de suivi en direct pour les spectateurs (lecture seule, plein écran).
 * Rafraîchit l'état depuis la base locale ; conçue pour être projetée. */
export function SpectatorMatch({ matchId }: { matchId: string }) {
  const trad = useT()
  const champ = useChampLabel()
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [names, setNames] = useState<Record<TeamSide, string>>({ A: 'Locaux', B: 'Visiteurs' })
  const [nowMs, setNowMs] = useState(() => Date.now())
  // Une seule carte de tirs ouverte sur tout l'écran : il est souvent projeté en
  // salle, deux cartes simultanées le rendraient illisible de loin.
  const [openShotsId, setOpenShotsId] = useState<string | null>(null)

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
    Promise.all([listPlayers(match.meta.clubId), listTeams()]).then(([roster, teams]) => {
      const map: Record<string, Player> = {}
      for (const p of roster) map[p.id] = p
      setPlayers(map)
      setNames({
        A: teams.find((t) => t.id === match.meta.clubId)?.name ?? trad('match.locaux'),
        B: teams.find((t) => t.id === match.meta.opponentId)?.name ?? trad('match.visiteurs'),
      })
    })
  }, [match?.meta.clubId, match?.meta.opponentId, trad])

  if (match === undefined) return <Screen><p style={{ color: C.muted }}>{trad('commun.chargement')}</p></Screen>
  if (match === null) return <Screen><p style={{ color: C.muted }}>{trad('apercu.introuvable')}</p></Screen>

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
        {/* Pas de lien retour vers "/" : cette page est une destination de
            partage (lien projeté / envoyé à des spectateurs sans club réglé),
            pas une porte d'entrée dans l'application derrière la garde club. */}
        <div className="mb-5 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-black uppercase tracking-wide"
            style={live ? { background: C.greenFill, color: C.onGreen } : finished ? { background: C.neutralBg, color: C.muted } : { background: C.amberBg, color: C.amber }}>
            {live && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: C.green }} />}
            {live ? trad('bord.enDirect') : finished ? trad('spect.termine') : trad('spect.aVenir')}
          </span>
        </div>

        <p className="text-center text-[12px] font-bold" style={{ color: C.muted }}>{champ(match.meta)}</p>

        {/* SCOREBOARD (blocs équipe : lisible sur mobile) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-6">
          {/* Nous en encre, l'adversaire en accent : les mêmes deux jetons que la
              table de marque, pour qu'un spectateur qui passe d'un écran à l'autre
              lise le même code. Ce sont des jetons de **thème**, et pas les anciens
              `--sb-*` du bandeau : ceux-là valaient un blanc en dur, correct sur un
              bandeau charbon et illisible ici, où le score est posé sur le fond clair
              de la page. Emprunter les couleurs d'une surface pour les employer sur
              une autre, c'est ce qui a produit un score blanc sur blanc. */}
          <TeamScore id={match.meta.clubId} name={names.A} score={ls.score.a} couleur={C.text} />
          <TeamScore id={match.meta.opponentId} name={names.B} score={ls.score.b} couleur={C.accent} />
        </div>
        <div className="mt-3 flex flex-col items-center gap-1">
          <span className="nums rounded-lg px-3.5 py-1.5 text-base font-black tabular-nums" style={{ background: C.card, color: finished ? C.muted : C.text, border: `1px solid ${C.border}` }}>
            {finished ? trad('resume.final').toUpperCase() : `${periodLabel} · ${fmt(displaySec)}`}
          </span>
          {!finished && ls.clockRunning && !canSimulate && (
            <span className="text-[12px] font-semibold" style={{ color: C.faint }}>{trad('spect.chronoMaj')}</span>
          )}
        </div>

        {/* BANDEAU FAUTES / TM (aucune faute/TM adverse saisissable, pas d'effectif en face) */}
        <div className="mt-5 grid grid-cols-1 gap-3">
          <MetaRow label={names.A} fouls={ls.teamFoulsThisPeriod.A} bonus={ls.bonus.A} to={ls.timeoutsRemaining.A} />
        </div>

        {/* STATS JOUEURS */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatList name={names.A} match={match} players={players}
            openId={openShotsId} onToggle={setOpenShotsId} />
          <OpponentPanel name={names.B} score={ls.score.b} />
        </div>

        <p className="mt-6 text-center text-[12px]" style={{ color: C.faint }}>{trad('spect.majAuto')}</p>
      </div>
    </Screen>
  )
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

/**
 * Un côté du tableau spectateur.
 *
 * Le score portait `teamColor(id)`, une teinte tirée d'un hachage de l'identifiant
 * parmi huit hexadécimaux façon NBA. C'est le bon procédé pour distinguer six
 * écussons dans une liste — et le mauvais ici : sur un tableau d'affichage, la
 * question n'est pas « laquelle des six équipes » mais « nous ou eux », et la réponse
 * était un cramoisi et un marine étrangers à la charte. Les deux jetons qui disent
 * exactement cela existaient déjà pour la table de marque : le nôtre en blanc,
 * l'adversaire en citron. L'écusson, lui, garde sa couleur de club — c'est là que
 * l'identité a un sens.
 */
function TeamScore({ id, name, score, couleur }: { id: string; name: string; score: number; couleur: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamBadge id={id} name={name} size="h-10 w-10 text-xs sm:h-14 sm:w-14 sm:text-sm" />
      <span className="line-clamp-2 min-h-[2.4em] w-full text-sm font-extrabold leading-tight sm:min-h-0 sm:text-lg">{name}</span>
      <span className="nums text-5xl font-black leading-none tabular-nums sm:text-7xl" style={{ color: couleur }}>{score}</span>
    </div>
  )
}

function MetaRow({ label, fouls, bonus, to }: { label: string; fouls: number; bonus: boolean; to: number }) {
  const trad = useT()
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <span className="truncate text-[12px] font-bold" style={{ color: C.muted }}>{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-[12px] font-bold">
        {bonus && <span className="rounded-md px-1.5 py-0.5 text-[12px] font-black uppercase" style={{ background: C.dangerFill, color: C.onDanger }}>{trad('panneau.bonus')}</span>}
        <span style={{ color: C.faint }}>{trad('panneau.fautes')} <span style={{ color: C.text }}>{fouls}</span></span>
        <span style={{ color: C.faint }}>{trad('spect.tm')} <span style={{ color: C.text }}>{to}</span></span>
      </span>
    </div>
  )
}

/** Côté spectateur, l'adversaire n'a pas d'effectif, donc pas de tableau joueur
 *  possible — on affiche à la place le score réel (saisi globalement) en gros,
 *  plutôt qu'un tableau vide sous un total à 0. */
function OpponentPanel({ name, score }: { name: string; score: number }) {
  const trad = useT()
  return (
    <section className="flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-8 text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <h3 className="text-sm font-extrabold uppercase tracking-wide">{name}</h3>
      <span className="nums text-6xl font-black leading-none tabular-nums" style={{ color: C.accent }}>{score}</span>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{trad('spect.scoreGlobal')}</p>
    </section>
  )
}

function StatList({ name, match, players, openId, onToggle }: {
  name: string; match: Match; players: Record<string, Player>
  openId: string | null; onToggle: (id: string | null) => void
}) {
  const trad = useT()
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
              <th className="px-3 py-2 text-left">{trad('equipe.numero')}</th><th className="px-2 py-2 text-left">{trad('resume.thJoueur')}</th>
              <Sth>{trad('resume.thPts')}</Sth><Sth>{trad('resume.th3pts')}</Sth><Sth>{trad('resume.thPd')}</Sth><Sth>{trad('spect.reb')}</Sth><Sth>{trad('resume.thCt')}</Sth><Sth>{trad('spect.f')}</Sth>
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
                          ? <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{trad('joueur.aucunTirRencontre')}</p>
                          : <ShotChart shots={shots} minAttempts={1} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>{trad('spect.pasDeStats')}</td></tr>}
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
              <td className="px-3 py-2"></td><td className="px-2 py-2 text-[12px] font-black uppercase">{trad('spect.total')}</td>
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
