import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { deleteMessage, getConvocation, getMessage, listMatches, listPlayers, listPlays, listTeams, listTrainings, saveMessage } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import { teamMatches, teamRecord, teamScorers } from '../../domain/teamRecord'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { since, nextFixture, type Fixture } from '../../domain/fixtures'
import { liveState } from '../../rules/ffbb'
import { ShotChart } from '../components/ShotCourt'
import { C, Panel, TeamBadge, Vous, bd, displayClock, fmtDate } from '../olive/kit'
import type { Convocation, Match, TeamMessage, Player, Team, Training } from '../../domain/types'
import type { Play } from '../../domain/plays'
import { Check } from 'lucide-react'
import { useLang, useT } from '../../i18n'
import { remoteEnabled } from '../../persistence/remote'

export function Dashboard() {
  const translate = useT()
  const { clubId, club } = useClub()
  const { can, playerId } = useAuth()
  // Le tableau de bord se lit en entier ; seuls les raccourcis qui mènent à une
  // écriture (planifier, convoquer) sont réservés à qui gère le club.
  const gere = can('manage')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [schemas, setSchemas] = useState<Play[]>([])
  const [convocation, setConvocation] = useState<Convocation | null>(null)
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    refresh()
      .then(() => Promise.all([listMatches(), listTeams(), listPlayers(clubId), listTrainings(), listPlays(clubId)]))
      .then(([ms, ts, ps, trs, sch]) => {
        if (cancelled) return
        setTeams(Object.fromEntries(ts.map((t) => [t.id, t])))
        setPlayers(ps)
        setMatches(ms)
        setTrainings(trs)
        setSchemas(sch)
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
  /* Trois états et non deux. Les chiffres de saison n'existent qu'après une rencontre
     **jouée** ; le bloc de mise en route ne vaut que pour un club qui n'a aucune
     rencontre **du tout**. Entre les deux — une rencontre planifiée, pas encore jouée
     — aucun des deux ne s'affiche, et c'est juste : le bloc « prochaine échéance »
     au-dessus dit déjà tout ce qu'il y a à dire à ce moment-là. */
  const aJoue = rec.played > 0
  const enMiseEnPlace = mine.length === 0
  /* Le bandeau et le bloc d'échéance se taisent pendant la mise en place, sinon
     l'écran invitait **trois fois** à planifier une rencontre : « Aucune rencontre
     prévue · Planifier », « Rien de planifié · Planifier », et la troisième étape du
     bloc ci-dessous. Répéter la même issue trois fois ne la rend pas plus claire, et
     les deux premières envoient droit dans le mur — sans adversaire enregistré,
     `/match/new` n'a rien à proposer. Le bloc de mise en route, lui, connaît l'ordre.
     La condition retient `fixture`, qui couvre aussi les séances : un club sans
     rencontre mais avec un entraînement au calendrier a bien quelque chose à annoncer. */
  const seulementMiseEnPlace = enMiseEnPlace && !fixture
  const autresEquipes = Object.keys(teams).filter((id) => id !== clubId).length

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
              {rec.played ? translate('bord.rencontresJouees', { count: rec.played }) : translate('bord.aucuneRencontreJouee')}
            </p>
          </div>
          {moi && (
            <Link to={`/players/${moi.id}`} className="ml-auto shrink-0 rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>
              {translate('bord.maFiche')}
            </Link>
          )}
        </div>

        <MessageDuCoach clubId={clubId} />

        {!seulementMiseEnPlace && (
          <>
            <Banner live={live} next={next} teams={teams} gere={gere} tientLaMarque={can('score')} />
            <Echeance fixture={fixture} teams={teams} players={players} convocation={convocation} schemas={schemas} gere={gere} />
          </>
        )}

        {/* Rien de joué : les chiffres de saison n'ont rien à dire, et six blocs vides
            valent moins qu'un seul bloc qui indique la suite. C'était l'état d'arrivée
            du bénévole qui vient de saisir son équipe — quatre tuiles à « — », une
            forme à « — », deux panneaux vides, et pas un bouton. */}
        {aJoue ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={translate('bord.bilan')} value={`${rec.wins}V – ${rec.losses}D`} hint={translate('commun.rencontre', { count: rec.played })} accent={rec.wins >= rec.losses ? C.green : C.accent} />
              <Stat label={translate('bord.pointsMarques')} value={String(rec.avgFor)} hint={translate('bord.parMatch')} />
              <Stat label={translate('bord.pointsEncaisses')} value={String(rec.avgAgainst)} hint={translate('bord.parMatch')} />
              <Stat label={translate('bord.differentiel')} value={diff > 0 ? `+${diff}` : String(diff)} hint={translate('bord.surLaSaison')} accent={diff > 0 ? C.green : diff < 0 ? C.danger : undefined} />
            </div>

            {lines.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('bord.forme')}</span>
                {lines.slice(0, 5).map((l) => (
                  <span key={l.match.id} className="grid h-6 w-6 place-items-center rounded-md text-[12px] font-black"
                    style={{ background: l.result === 'V' ? C.greenBg : C.dangerBg, color: l.result === 'V' ? C.green : C.danger }}>
                    {l.result}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : enMiseEnPlace ? (
          <PourCommencer roster={players.length} autresEquipes={autresEquipes} clubId={clubId} gere={gere} />
        ) : null}

        <div className={`${aJoue ? 'mt-6' : 'mt-5'} grid gap-5 lg:grid-cols-[1fr_420px] [&>*]:min-w-0`}>
          {aJoue && <Panel title={translate('bord.meilleursMarqueurs')}>
            {scorers.length === 0 ? (
              <Empty>{translate('bord.pasDePoints')}</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scorers.map(([pid, pts], i) => {
                  const p = byId[pid]
                  const pct = shootingPct(shotsOf(matches, pid)).fg
                  const estMoi = pid === moi?.id
                  return (
                    <li key={pid}>
                      <Link to={`/players/${pid}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-[var(--c-hover)]"
                        style={estMoi ? { background: C.accentBg, border: `1px solid ${C.accentBd}` } : { background: C.panel }}>
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.accent : C.faint }}>{i + 1}</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p?.number ?? '?'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : 'Joueur'}</span>
                        {estMoi && <Vous />}
                        {/* Titre explicite : ce pourcentage ne porte que sur les tirs
                            localisés, alors que les points juste à côté comptent tout
                            (lancers francs compris) — cf. PlayerDetail. */}
                        <span className="text-[12px] font-semibold" style={{ color: C.muted }} title={translate('bord.reussiteTirs')}>{pct === null ? '—' : `${pct} %`}</span>
                        <span className="w-14 text-right text-sm font-black tabular-nums">{pts} pts</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>}

          {/* La carte de tirs ne s'affiche que s'il y a des tirs : vide, c'est un
              terrain dessiné pour rien, et elle ne dit pas quoi faire. */}
          {aJoue && <Panel title={openPlayer ? translate('bord.hotZoneJoueur', { nom: byId[openPlayer]?.lastName ?? translate('bord.joueur') }) : translate('bord.hotZoneEquipe')}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip active={!openPlayer} onClick={() => setOpenPlayer(null)}>{translate('bord.equipe')}</Chip>
              {players.map((p) => (
                <Chip key={p.id} active={openPlayer === p.id} onClick={() => setOpenPlayer(p.id)}>{p.number}</Chip>
              ))}
            </div>
            {shownShots.length === 0 ? <Empty>{translate('bord.aucunTir')}</Empty> : <ShotChart shots={shownShots} minAttempts={openPlayer ? 1 : 3} />}
          </Panel>}
        </div>
      </div>
    </div>
  )
}

/** Au-delà de deux semaines, un message n'informe plus : il traîne. Le badge d'âge
 *  passe alors à l'ambre — le même code couleur que « à venir » ailleurs, ici pour
 *  dire « ceci date ». */
const OUBLI_MS = 14 * 24 * 3600_000

/**
 * Le message du coach à son équipe, en tête du tableau de bord — l'écran que tout
 * le monde ouvre, joueurs compris. Un seul message à la fois : en écrire un
 * nouveau remplace le précédent (cf. `MessageEquipe`). Ce n'est pas une
 * messagerie : ni fil, ni réponse, ni destinataire.
 *
 * Lire est libre, comme tout le reste : c'est un message pour l'équipe, y compris
 * pour un joueur qui n'a aucun droit d'écriture. Écrire, modifier et effacer
 * relèvent de l'administration : leurs boutons ne s'affichent que pour elle, et
 * la garde reste derrière eux.
 */
function MessageDuCoach({ clubId }: { clubId: string }) {
  const translate = useT()
  const { lang } = useLang()
  const { can, guard } = useAuth()
  const gere = can('manage')
  const [message, setMessage] = useState<TeamMessage | null>(null)
  const [saisieOuverte, setSaisieOuverte] = useState(false)
  const [text, setTexte] = useState('')

  useEffect(() => {
    let cancelled = false
    getMessage(clubId).then((m) => { if (!cancelled) setMessage(m ?? null) })
    return () => { cancelled = true }
  }, [clubId])

  // Un blanc n'est pas un message : il n'occupe pas le tableau de bord, et rien
  // ne se publie tant que le champ ne porte que des espaces.
  const affiché = message && message.text.trim() ? message : null

  const ouvrir = () => guard('manage', () => { setTexte(affiché?.text ?? ''); setSaisieOuverte(true) })
  const publier = () => guard('manage', async () => {
    const written = { clubId, text: text.trim(), writtenAt: new Date().toISOString() }
    await saveMessage(written)
    setMessage(written)
    setSaisieOuverte(false)
  })
  const effacer = () => guard('manage', async () => {
    await deleteMessage(clubId)
    setMessage(null)
    setSaisieOuverte(false)
  })

  // Un formulaire de saisie apparaît sur un clic, jamais d'emblée : le tableau de
  // bord est ce qu'on vient lire, écrire à l'équipe est l'exception.
  if (saisieOuverte) {
    return (
      <section className="mb-5 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
        <div className="mb-3 flex items-center gap-3">
          <label htmlFor="message-equipe" className="text-xs font-bold uppercase tracking-wide" style={{ color: C.accent }}>{translate('bord.messageEquipe')}</label>
          <button onClick={() => setSaisieOuverte(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>{translate('commun.fermer2')}</button>
        </div>
        <textarea id="message-equipe" rows={3} value={text} onChange={(e) => setTexte(e.target.value)}
          placeholder={translate('bord.messagePlaceholder')}
          className="w-full rounded-[10px] p-3 text-sm" style={{ background: C.panel, border: bd, color: C.text }} />
        <button onClick={publier} disabled={!text.trim()} className="mt-3 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>
          {translate('bord.publierMessage')}
        </button>
        {/* Comme les convocations, les entraînements et les schémas : même
            formulation, pour ne pas laisser croire à deux limites différentes. */}
        {!remoteEnabled() && <p className="mt-3 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{translate('bord.messageLocal')}</p>}
      </section>
    )
  }

  // Pas de message et pas le droit d'en écrire : rien à montrer plutôt qu'un
  // bouton qui réclamerait un code.
  if (!affiché) {
    if (!gere) return null
    return (
      <button onClick={ouvrir} className="mb-5 rounded-xl px-3 py-1.5 text-[12px] font-bold" style={{ border: bd, color: C.muted }}>
        {translate('bord.ajouterMessage')}
      </button>
    )
  }

  const oublié = Date.now() - Date.parse(affiché.writtenAt) > OUBLI_MS
  return (
    <section data-testid="team-message" className="mb-5 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${oublié ? C.amberBd : C.accentBd}` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('bord.messageEquipe')}</span>
        <span className="rounded-md px-2 py-0.5 text-[12px] font-black"
          style={oublié ? { background: C.amberBg, color: C.amber } : { background: C.accentBg, color: C.accent }}>
          {since(affiché.writtenAt, lang) ?? translate('commun.aLInstant')}
        </span>
        {gere && (
          <>
            <button onClick={ouvrir} className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ border: bd, color: C.muted }}>{translate('commun.modifierMaj')}</button>
            <button onClick={effacer} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ border: bd, color: C.accent }}>{translate('commun.effacer')}</button>
          </>
        )}
      </div>
      {/* `whitespace-pre-wrap` : deux consignes sur deux lignes restent sur deux lignes. */}
      <p className="whitespace-pre-wrap text-[15px] font-semibold">{affiché.text}</p>
    </section>
  )
}

// `live` et `next` viennent tous les deux de `mine`, déjà filtré sur
// `meta.clubId === clubId` : notre club est donc toujours le côté A.
function Banner({ live, next, teams, gere, tientLaMarque }: { live?: Match; next?: Match; teams: Record<string, Team>; gere: boolean; tientLaMarque: boolean }) {
  const translate = useT()
  const opponent = (m: Match) => teams[m.meta.opponentId]?.name ?? translate('bord.adversaire')
  if (live) {
    const ls = liveState(live)
    const dc = displayClock(live)
    const mine = ls.score.a
    const opp = ls.score.b
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
        <span className="rounded-md px-2 py-0.5 text-[12px] font-black uppercase" style={{ background: C.greenFill, color: C.onGreen }}>{translate('bord.enDirect')}</span>
        <span className="nums text-3xl font-black tabular-nums">{mine} – {opp}</span>
        <span className="text-sm font-bold" style={{ color: C.muted }}>{translate('bord.contre', { equipe: opponent(live) })}</span>
        <span className="nums text-sm font-bold" style={{ color: C.faint }}>{dc.label} · {dc.clock}</span>
        {/* Le score en direct se lit par tout le monde ; ouvrir la table de marque
            est le geste de celui qui la tient, et lui seul y est invité. */}
        {tientLaMarque && (
          <Link to={`/match/${live.id}/live`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('bord.ouvrirTable')}
          </Link>
        )}
      </div>
    )
  }
  if (next) {
    const f = fmtDate(next.meta.date)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('bord.prochaineRencontre')}</span>
        <span className="text-sm font-bold">{translate('bord.contre', { equipe: opponent(next) })}</span>
        <span className="text-sm" style={{ color: C.muted }}>{[f.long, next.meta.time, next.meta.venue].filter(Boolean).join(' · ')}</span>
        <Link to={`/match/${next.id}`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>{translate('bord.voirFiche')}</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-sm" style={{ color: C.muted }}>{translate('bord.aucuneRencontrePrevue')}</span>
      {/* Planifier écrit : le raccourci ne s'affiche qu'à qui gère le club. */}
      {gere && <Link to="/match/new" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('bord.planifierRencontre')}</Link>}
    </div>
  )
}

/** Bloc « prochaine échéance » : rencontre ou entraînement, convocation comprise.
 *  `fixture` exclut déjà le match en direct (voir le calcul dans `Dashboard`) : ce
 *  composant n'a donc jamais à s'en soucier, il affiche simplement ce qu'on lui donne. */
function Echeance({ fixture, teams, players, convocation, schemas, gere }: { fixture: Fixture | null; teams: Record<string, Team>; players: Player[]; convocation: Convocation | null; schemas: Play[]; gere: boolean }) {
  const translate = useT()
  if (!fixture) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('bord.prochaineEcheance')}</span>
        <span className="text-sm" style={{ color: C.muted }}>{translate('bord.rienDePlanifie')}</span>
        {gere && <Link to="/calendrier" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('bord.planifier')}</Link>}
      </div>
    )
  }

  if (fixture.kind === 'training') {
    const t = fixture.training
    const f = fmtDate(t.date)
    // Résolus dans la bibliothèque plutôt que pris tels quels : un identifiant qui
    // ne correspond à aucun schéma (supprimé depuis) n'ouvrirait qu'un lecteur vide.
    const prévus = schemas.filter((s) => t.playIds?.includes(s.id))
    return (
      <div className="mt-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('bord.prochaineEcheance')}</span>
        <p className="mt-1 text-sm font-bold">{translate('bord.entrainement')}</p>
        <p className="text-sm" style={{ color: C.muted }}>{[f.long, t.time, t.place].filter(Boolean).join(' · ') || '—'}</p>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Thème : {t.theme ?? '—'}</p>
        {prévus.length > 0 && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: C.border }}>
            {/* Le chemin le plus court entre « c'est mardi » et « voilà ce qu'on
                travaille » : chaque schéma prévu ouvre directement son lecteur. */}
            <p className="text-sm font-bold">{translate('bord.auProgramme')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {prévus.map((s) => (
                <Link key={s.id} to={`/schemas/${s.id}/lecteur`} className="rounded-lg px-2.5 py-1 text-[12px] font-bold"
                  style={{ background: C.accentBg, color: C.accent }}>
                  ▶ {s.nom}
                </Link>
              ))}
            </div>
          </div>
        )}
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
      <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('bord.prochaineEcheance')}</span>
      <p className="mt-1 text-sm font-bold">{translate('bord.contre', { equipe: opponent })}</p>
      <p className="text-sm" style={{ color: C.muted }}>{[f.long, m.meta.time, m.meta.venue].filter(Boolean).join(' · ') || '—'}</p>
      {/* La convocation vit sur la fiche de la rencontre, à sa place — mais c'est
          ici qu'on la regarde. Le lien y mène directement, à l'ancre : sans lui,
          rien nulle part ne disait où l'on convoque. Le compte se juge sur les
          convoqués retenus, pas sur l'existence de l'enregistrement : une
          convocation vidée de ses joueurs est une absence de convoqués, et c'est
          justement le moment où l'on veut agir. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: C.border }}>
        {/* `min-w-[180px]` : sur téléphone, plutôt que d'écraser « Personne n'est
            convoqué » sur trois lignes à côté du bouton, la ligne se casse en deux. */}
        <div className="min-w-[180px] flex-1">
          {convoqués.length === 0 ? (
            <p className="text-sm font-bold" style={{ color: C.amber }}>{translate('bord.personneConvoquee')}</p>
          ) : (
            <>
              <p className="text-sm font-bold">{translate('compte.convoque', { count: convoqués.length })}</p>
              {rdv && <p className="mt-0.5 text-sm" style={{ color: C.muted }}>Rendez-vous {rdv}</p>}
              <p className="mt-1 text-sm" style={{ color: C.muted }}>{convoqués.map((p) => `${p.lastName} ${p.firstName}`).join(', ')}</p>
            </>
          )}
        </div>
        {/* Convoquer écrit : le raccourci est celui du coach. Le compte et les noms
            juste à gauche, eux, restent lus par toute l'équipe. */}
        {gere && (
          <Link to={`/match/${m.id}#convocation`} className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold"
            style={convoqués.length === 0 ? { background: C.brand, color: C.onBrand } : { border: bd, color: C.text }}>
            {convoqués.length === 0 ? translate('bord.convoquerEquipe') : translate('bord.modifierConvocation')}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * La mise en route, pour un club qui n'a encore aucune rencontre.
 *
 * Ce qu'elle remplace : quatre tuiles de statistiques à « — », une frise de forme à
 * « — », et deux panneaux annonçant qu'il n'y a ni marqueur ni tir. Six blocs pour
 * dire six fois la même chose — que rien n'a commencé — et pas un seul bouton. Le
 * bénévole qui venait de saisir son effectif arrivait là et n'avait rien à cliquer.
 *
 * Trois partis pris.
 *
 * Un seul bloc, et une liste ordonnée. Trois cartes de même taille auraient répété
 * la structure qu'on vient de retirer, et l'ordre porte ici une vraie contrainte :
 * on ne planifie pas une rencontre sans adversaire enregistré. Les numéros sont donc
 * mérités, ils ne décorent pas une séquence arbitraire.
 *
 * L'état de chaque étape est **lu dans les données**, jamais mémorisé. Rien à
 * stocker, rien à réinitialiser, et le bloc disparaît de lui-même dès la première
 * rencontre créée — sans bouton « ne plus afficher », parce qu'il n'y a rien à
 * congédier.
 *
 * L'effectif est le premier palier et il s'annonce comme atteint : c'est le moment
 * où l'application cesse d'être vide et commence à décrire une vraie équipe. Les
 * cinq joueurs ne sont pas une exigence de l'application — `StartingFiveGate` sait
 * démarrer avec moins — mais on ne met pas cinq joueurs sur le terrain avec quatre.
 */
function PourCommencer({ roster, autresEquipes, clubId, gere }: { roster: number; autresEquipes: number; clubId: string; gere: boolean }) {
  const translate = useT()
  const etapes = [
    {
      fait: roster >= 5,
      titre: roster === 0 ? translate('commencer.effectifVide') : translate('commencer.effectif', { n: translate('commun.joueur', { count: roster }) }),
      detail: roster >= 5 ? translate('commencer.effectifPret') : translate('commencer.effectifIncomplet'),
      lien: `/teams/${clubId}`,
      action: translate('commencer.completer'),
    },
    {
      fait: autresEquipes > 0,
      titre: translate('commencer.adversaireTitre'),
      detail: translate('commencer.adversaireDetail'),
      lien: '/teams/new',
      action: translate('commencer.nouvelleEquipe'),
    },
    {
      fait: false,
      titre: translate('commencer.rencontreTitre'),
      detail: translate('commencer.rencontreDetail'),
      lien: '/match/new',
      action: translate('commencer.nouvelleRencontre'),
    },
  ]
  const current = etapes.findIndex((e) => !e.fait)

  return (
    <section className="mt-5 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <h2 className="text-base font-extrabold tracking-tight">
        {roster >= 5 ? translate('commencer.titrePret') : translate('commencer.titre')}
      </h2>
      <p className="mt-1 text-[13px]" style={{ color: C.muted }}>
        {gere
          ? translate('commencer.sousTitreGere')
          : translate('commencer.sousTitreVisiteur')}
      </p>

      <ol className="mt-4 space-y-2">
        {etapes.map((e, i) => (
          /* Empilé sous `sm`, en rangée au-delà. En rangée à toute largeur, le bouton
             réservait sa place et le texte se laissait comprimer à un mot par ligne :
             « Enregistrez un adversaire » tenait sur trois lignes et son explication
             sur dix. Un bouton qui ne cède rien n'a pas sa place à côté du texte sur
             trois cent soixante-quinze pixels. */
          <li key={e.titre} className="flex flex-col gap-2.5 rounded-xl px-3 py-3 sm:flex-row sm:items-center sm:gap-3" style={{ background: C.panel }}>
            <span className="flex min-w-0 items-start gap-3 sm:items-center">
              {/* Le repère d'étape : la coche pour ce qui est fait, le numéro sinon. Un
                  caractère « ✓ » aurait tenu lieu d'icône — il ne s'accorde ni à la
                  graisse ni au tracé du reste, et dépend de la police installée. */}
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black sm:mt-0"
                style={e.fait
                  ? { background: C.greenFill, color: C.onGreen }
                  : i === current ? { background: C.brand, color: C.onBrand } : { background: C.neutralBg, color: C.faint }}>
                {e.fait ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold" style={{ color: e.fait ? C.muted : C.text }}>{e.titre}</span>
                <span className="block text-[12px]" style={{ color: C.faint }}>{e.detail}</span>
              </span>
            </span>
            {/* L'action ne s'affiche que sur l'étape courante : trois boutons à la fois
                laisseraient choisir un ordre qui ne marche pas. */}
            {gere && i === current && (
              <Link to={e.lien} className="shrink-0 rounded-xl px-3.5 py-2.5 text-center text-[13px] font-bold text-[var(--c-on-brand)] sm:ml-auto" style={{ background: C.brand }}>
                {e.action} →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg px-2.5 py-1 text-[12px] font-bold transition"
      style={active ? { background: C.brand, color: C.onBrand } : { background: C.card2, color: C.muted, border: bd }}>
      {children}
    </button>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
