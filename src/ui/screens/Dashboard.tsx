import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { getConvocation, listMatches, listPlayers, listTeams, listTrainings } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import { teamMatches, teamRecord, teamScorers } from '../../domain/teamRecord'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { nextFixture, type Fixture } from '../../domain/fixtures'
import { liveState } from '../../rules/ffbb'
import { ShotChart } from '../components/ShotCourt'
import { C, bd, TeamBadge, Vous, displayClock, fmtDate } from '../olive/kit'
import type { Convocation, Match, Player, Team, Training } from '../../domain/types'

export function Dashboard() {
  const { clubId, club } = useClub()
  const { playerId } = useAuth()
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [convocation, setConvocation] = useState<Convocation | null>(null)
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    refresh()
      .then(() => Promise.all([listMatches(), listTeams(), listPlayers(clubId), listTrainings()]))
      .then(([ms, ts, ps, trs]) => {
        if (cancelled) return
        setTeams(Object.fromEntries(ts.map((t) => [t.id, t])))
        setPlayers(ps)
        setMatches(ms)
        setTrainings(trs)
      })
    return () => { cancelled = true }
  }, [clubId])

  // Calculs dérivés placés avant les sorties anticipées ci-dessous, pour que l'effet
  // qui suit (chargement de la convocation) respecte les règles des hooks : toujours
  // appelé, dans le même ordre, à chaque rendu.
  const mine = (matches ?? []).filter((m) => m.meta.clubId === clubId)
  const live = mine.find((m) => m.status === 'live')
  const nosEntrainements = trainings.filter((t) => t.clubId === clubId)
  // Un match en direct occupe déjà le bandeau ci-dessous : le bloc « prochaine
  // échéance » doit alors annoncer la suivante, pas répéter celle déjà affichée.
  // Filtré sur le statut, pas sur l'identité de `live` : rien n'empêche deux
  // rencontres `live` à la fois (une seconde démarrée sans terminer la première),
  // et chacune doit rester exclue des échéances à venir.
  const matchesPourEcheance = mine.filter((m) => m.status !== 'live')
  const fixture = nextFixture(matchesPourEcheance, nosEntrainements, new Date())
  const fixtureMatchId = fixture?.kind === 'match' ? fixture.match.id : null

  useEffect(() => {
    if (!fixtureMatchId) { setConvocation(null); return }
    let cancelled = false
    getConvocation(fixtureMatchId).then((c) => { if (!cancelled) setConvocation(c ?? null) })
    return () => { cancelled = true }
  }, [fixtureMatchId])

  if (!clubId || !club) return null
  if (!matches) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>

  // Dérivé de la même échéance que le bloc ci-dessous (`fixture`), qui écarte déjà le
  // passé et les rencontres terminées : sans ce partage, une rencontre planifiée puis
  // jamais jouée ferait annoncer ici « Prochaine rencontre » alors que le bloc dit
  // « Rien de planifié », à quelques pixels d'écart.
  const next = fixture?.kind === 'match' ? fixture.match : undefined
  // `teamRecord`/`teamMatches` savent aussi lire côté adversaire (légitime pour
  // la fiche d'une équipe adverse) : sur ce tableau de bord, seul `mine` compte,
  // sans quoi un club qui n'est que `opponentId` d'une rencontre récupérerait le
  // bilan de « nos » confrontations avec lui.
  const rec = teamRecord(clubId, mine)
  const lines = teamMatches(clubId, mine).filter((l) => l.result)
  const diff = rec.pointsFor - rec.pointsAgainst

  const rosterIds = players.map((p) => p.id)
  const clubShots = rosterIds.flatMap((id) => shotsOf(matches, id))
  const scorers = [...teamScorers(clubId, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const shownShots = openPlayer ? shotsOf(matches, openPlayer) : clubShots
  // Résolu dans l'effectif plutôt que pris tel quel : un identifiant qui ne
  // correspond à personne (joueur retiré) doit se comporter comme une absence
  // d'identité, sans raccourci vers une fiche disparue ni ligne mise en évidence.
  const moi = players.find((p) => p.id === playerId) ?? null

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <TeamBadge id={club.id} name={club.name} size="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{club.name}</h1>
            <p className="text-sm" style={{ color: C.muted }}>
              {rec.played ? `${rec.played} rencontre${rec.played > 1 ? 's' : ''} jouée${rec.played > 1 ? 's' : ''}` : 'Aucune rencontre jouée'}
            </p>
          </div>
          {moi && (
            <Link to={`/players/${moi.id}`} className="ml-auto shrink-0 rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>
              Ma fiche →
            </Link>
          )}
        </div>

        <Banner live={live} next={next} teams={teams} />

        <Echeance fixture={fixture} teams={teams} players={players} convocation={convocation} />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Bilan" value={`${rec.wins}V – ${rec.losses}D`} hint={rec.played ? `${rec.played} rencontres` : 'aucune'} accent={rec.wins >= rec.losses ? C.green : C.pink} />
          <Stat label="Points marqués" value={rec.played ? String(rec.avgFor) : '—'} hint="par match" />
          <Stat label="Points encaissés" value={rec.played ? String(rec.avgAgainst) : '—'} hint="par match" />
          <Stat label="Différentiel" value={rec.played ? (diff > 0 ? `+${diff}` : String(diff)) : '—'} hint="sur la saison" accent={diff > 0 ? C.green : diff < 0 ? C.pink : undefined} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Forme</span>
          {lines.slice(0, 5).map((l) => (
            <span key={l.match.id} className="grid h-6 w-6 place-items-center rounded-md text-[11px] font-black"
              style={{ background: l.result === 'V' ? C.greenBg : 'rgba(255,77,109,0.14)', color: l.result === 'V' ? C.green : C.pink }}>
              {l.result}
            </span>
          ))}
          {lines.length === 0 && <span className="text-sm" style={{ color: C.muted }}>—</span>}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_420px]">
          <Panel title="Meilleurs marqueurs">
            {scorers.length === 0 ? (
              <Empty>Pas encore de points marqués.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scorers.map(([pid, pts], i) => {
                  const p = byId[pid]
                  const pct = shootingPct(shotsOf(matches, pid)).fg
                  const estMoi = pid === moi?.id
                  return (
                    <li key={pid}>
                      <Link to={`/players/${pid}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/5"
                        style={estMoi ? { background: C.accentBg, border: `1px solid ${C.accent}55` } : { background: C.panel }}>
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.orange : C.faint }}>{i + 1}</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p?.number ?? '?'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : 'Joueur'}</span>
                        {estMoi && <Vous />}
                        {/* Titre explicite : ce pourcentage ne porte que sur les tirs
                            localisés, alors que les points juste à côté comptent tout
                            (lancers francs compris) — cf. PlayerDetail. */}
                        <span className="text-[11px] font-semibold" style={{ color: C.muted }} title="Réussite sur les tirs localisés">{pct === null ? '—' : `${pct} %`}</span>
                        <span className="w-14 text-right text-sm font-black tabular-nums">{pts} pts</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title={openPlayer ? `Hot zone — ${byId[openPlayer]?.lastName ?? 'joueur'}` : 'Hot zone — équipe'}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip active={!openPlayer} onClick={() => setOpenPlayer(null)}>Équipe</Chip>
              {players.map((p) => (
                <Chip key={p.id} active={openPlayer === p.id} onClick={() => setOpenPlayer(p.id)}>{p.number}</Chip>
              ))}
            </div>
            {shownShots.length === 0 ? <Empty>Aucun tir localisé pour l’instant.</Empty> : <ShotChart shots={shownShots} minAttempts={openPlayer ? 1 : 3} />}
          </Panel>
        </div>
      </div>
    </div>
  )
}

// `live` et `next` viennent tous les deux de `mine`, déjà filtré sur
// `meta.clubId === clubId` : notre club est donc toujours le côté A.
function Banner({ live, next, teams }: { live?: Match; next?: Match; teams: Record<string, Team> }) {
  const opponent = (m: Match) => teams[m.meta.opponentId]?.name ?? 'Adversaire'
  if (live) {
    const ls = liveState(live)
    const dc = displayClock(live)
    const mine = ls.score.a
    const opp = ls.score.b
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accent}55` }}>
        <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: C.greenBg, color: C.green }}>En direct</span>
        <span className="nums text-3xl font-black tabular-nums">{mine} – {opp}</span>
        <span className="text-sm font-bold" style={{ color: C.muted }}>contre {opponent(live)}</span>
        <span className="nums text-sm font-bold" style={{ color: C.faint }}>{dc.label} · {dc.clock}</span>
        <Link to={`/match/${live.id}/live`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
          Ouvrir la table de marque →
        </Link>
      </div>
    )
  }
  if (next) {
    const f = fmtDate(next.meta.date)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Prochaine rencontre</span>
        <span className="text-sm font-bold">contre {opponent(next)}</span>
        <span className="text-sm" style={{ color: C.muted }}>{[f.long, next.meta.time, next.meta.venue].filter(Boolean).join(' · ')}</span>
        <Link to={`/match/${next.id}`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>Voir la fiche →</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-sm" style={{ color: C.muted }}>Aucune rencontre prévue.</span>
      <Link to="/match/new" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>+ Planifier une rencontre</Link>
    </div>
  )
}

/** Bloc « prochaine échéance » : rencontre ou entraînement, convocation comprise.
 *  `fixture` exclut déjà le match en direct (voir le calcul dans `Dashboard`) : ce
 *  composant n'a donc jamais à s'en soucier, il affiche simplement ce qu'on lui donne. */
function Echeance({ fixture, teams, players, convocation }: { fixture: Fixture | null; teams: Record<string, Team>; players: Player[]; convocation: Convocation | null }) {
  if (!fixture) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Prochaine échéance</span>
        <span className="text-sm" style={{ color: C.muted }}>Rien de planifié pour l’instant.</span>
        <Link to="/calendrier" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>+ Planifier →</Link>
      </div>
    )
  }

  if (fixture.kind === 'training') {
    const t = fixture.training
    const f = fmtDate(t.date)
    return (
      <div className="mt-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Prochaine échéance</span>
        <p className="mt-1 text-sm font-bold">Entraînement</p>
        <p className="text-sm" style={{ color: C.muted }}>{[f.long, t.time, t.place].filter(Boolean).join(' · ') || '—'}</p>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Thème : {t.theme ?? '—'}</p>
      </div>
    )
  }

  const m = fixture.match
  const f = fmtDate(m.meta.date)
  const opponent = teams[m.meta.opponentId]?.name ?? 'Adversaire'
  const convoqués = (convocation?.playerIds ?? [])
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p)
  const rdv = [convocation?.meetTime, convocation?.meetPlace].filter(Boolean).join(' · ')

  return (
    <div className="mt-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Prochaine échéance</span>
      <p className="mt-1 text-sm font-bold">contre {opponent}</p>
      <p className="text-sm" style={{ color: C.muted }}>{[f.long, m.meta.time, m.meta.venue].filter(Boolean).join(' · ') || '—'}</p>
      {convocation ? (
        <div className="mt-3 border-t pt-3" style={{ borderColor: C.border }}>
          <p className="text-sm font-bold">{convoqués.length} convoqué{convoqués.length > 1 ? 's' : ''}</p>
          {rdv && <p className="mt-0.5 text-sm" style={{ color: C.muted }}>Rendez-vous {rdv}</p>}
          {convoqués.length > 0 && (
            <p className="mt-1 text-sm" style={{ color: C.muted }}>{convoqués.map((p) => `${p.lastName} ${p.firstName}`).join(', ')}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm" style={{ color: C.muted }}>Convocation à préparer.</p>
      )}
    </div>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
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
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition"
      style={active ? { background: C.accent, color: '#fff' } : { background: C.card2, color: C.muted, border: bd }}>
      {children}
    </button>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
