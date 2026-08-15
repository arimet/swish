/**
 * Le ménage de l'administrateur : supprimer en bloc ce qu'on ne veut plus, après
 * quelques saisons d'essais où l'on ne va pas retirer les rencontres une par une.
 *
 * Tout ici est irréversible : il n'y a pas de corbeille, et rien de ce qui est
 * effacé n'existe ailleurs (résultats, convocations, entraînements et schémas ne
 * passent pas par la file de synchronisation). Chaque opération annonce donc son
 * périmètre **et son compte réel** avant d'agir, et une opération qui ne détruirait
 * rien est désactivée : un bouton actif qui ne fait rien se lit comme une panne.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { years, hasEvents, leagues, clubsOfGames, ofYear, ofLeague } from '../../domain/menage'
import type { Match, ReportedResult, Training } from '../../domain/types'
import type { Play } from '../../domain/plays'
import {
  clearClubStats, deleteAllResults, deleteMatchesWhere, deletePlaysOfClub, deleteTrainingsOfClub,
  listMatches, listPlays, listResults, listTrainings, wipeAll,
} from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, useLeagueLabel } from '../olive/kit'
import { syncState, hydrate, token, remoteEnabled, setToken, type State } from '../../persistence/remote'

/** Une opération de ménage prête à être confirmée : ce qu'elle annonce, et ce
 *  qu'elle fait. Rien n'est exécuté avant la confirmation. */
interface Operation {
  titre: string
  message: string
  /** Texte à recopier pour confirmer — réservé à la remise à zéro complète. */
  expectedInput?: string
  run: () => Promise<unknown>
}

/* Le pluriel passe par le catalogue : l'ancien helper accolait un « s » au mot
   français, ce qui ne se traduit pas — l'anglais n'accorde pas les mêmes mots au même
   endroit, et « feuille/feuilles » n'a pas de correspondance mécanique en anglais. */

export function Admin() {
  const translate = useT()
  const { clubId, club, teams, clear } = useClub()
  const { can, guard } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<Match[]>([])
  const [results, setResults] = useState<ReportedResult[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [plays, setPlays] = useState<Play[]>([])
  // L'opération dont on a demandé la confirmation. Le droit est vérifié à
  // l'ouverture du dialogue, comme sur la fiche d'équipe et la bibliothèque.
  const [demande, setDemande] = useState<Operation | null>(null)

  const reload = useCallback(async () => {
    const [ms, rs, ts, ps] = await Promise.all([listMatches(), listResults(), listTrainings(), clubId ? listPlays(clubId) : []])
    setMatches(ms); setResults(rs); setTrainings(ts); setPlays(ps)
  }, [clubId])
  useEffect(() => { reload() }, [reload])

  /* « Match amical » est la valeur stockée pour une rencontre sans championnat, et
     elle sert de clef de regroupement ici : on la traduit au moment de l'écrire, pas
     avant, sinon les deux langues découperaient deux groupes différents. */
  const leagueName = useLeagueLabel()
  const teamName = useCallback((id: string) => teams.find((t) => t.id === id)?.name ?? translate('commun.equipe'), [teams, translate])
  const sessions = useMemo(() => trainings.filter((t) => t.clubId === clubId), [trainings, clubId])

  // Garder d'abord, muter ensuite : la table de marque ne voit pas s'ouvrir un
  // dialogue de confirmation qu'elle n'aurait pas le droit de valider.
  const ask = (op: Operation) => guard('manage', () => setDemande(op))
  const confirmer = async () => {
    if (!demande) return
    await demande.run()
    await reload()
  }

  const supprimerRencontres = (libellé: string, filtre: (m: Match) => boolean, n: number) => ask({
    titre: translate('admin.supprimerRencontresTitre'),
    message: translate('admin.supprimerRencontresTexte', { count: translate('compte.rencontre', { count: n }), label: libellé }),
    run: () => deleteMatchesWhere(filtre),
  })

  // La coquille ne monte cet écran que derrière un club résolu ; la branche sans
  // club évite un `clubId!` dans chaque opération qui en dépend.
  if (!clubId) return null

  // Le menu ne montre déjà l'entrée qu'à l'administrateur ; l'URL directe suit la
  // même règle. Cet écran n'est qu'une planche de boutons destructeurs : sans le
  // droit, il ne resterait que des comptes sous des boutons qui réclament un code.
  // Les gardes sur chaque opération restent en place derrière ce renvoi.
  if (!can('manage')) return <Navigate to="/" replace />

  return (
    <div className="p-6">
      <p className="mb-6 rounded-2xl px-4 py-3 text-sm" style={{ background: C.accentBg, color: C.accent }}>
        {translate(remoteEnabled() ? 'admin.avertissementPartage' : 'admin.avertissement')}
      </p>

      <div className="space-y-6">
        <Synchronisation />

        <Bloc titre={translate('admin.parChampionnat')} aide={translate('admin.aideChampionnat')}>
          {leagues(matches).map((champ) => {
            const n = matches.filter(ofLeague(champ)).length
            return (
              <Row key={champ} libelle={leagueName(champ)} count={translate('compte.rencontre', { count: n })} action={translate('commun.supprimer')}
                aria={translate('admin.supprimerRencontresDe', { what: leagueName(champ) })} disabled={n === 0}
                onClick={() => supprimerRencontres(`« ${leagueName(champ)} »`, ofLeague(champ), n)} />
            )
          })}
          {matches.length === 0 && <Vide>{translate('admin.aucuneRencontre')}</Vide>}
        </Bloc>

        <Bloc titre={translate('admin.parAnnee')} aide={translate('admin.aideAnnee')}>
          {years(matches).map((year) => {
            const n = matches.filter(ofYear(year)).length
            return (
              <Row key={year} libelle={translate('admin.annee', { year })} count={translate('compte.rencontre', { count: n })} action={translate('commun.supprimer')}
                aria={translate('admin.supprimerRencontresAnnee', { year })} disabled={n === 0}
                onClick={() => supprimerRencontres(translate('admin.anneeCivile', { year }), ofYear(year), n)} />
            )
          })}
          {years(matches).length === 0 && <Vide>{translate('admin.aucuneRencontreDatee')}</Vide>}
        </Bloc>

        <Bloc titre={translate('admin.statsEquipe')} aide={translate('admin.aideStats')}>
          {clubsOfGames(matches).map((id) => {
            const n = matches.filter(hasEvents(id)).length
            return (
              <Row key={id} libelle={teamName(id)} count={translate('admin.aVider', { count: translate('compte.feuille', { count: n }) })} action={translate('admin.vider')}
                aria={translate('admin.viderFeuillesDe', { name: teamName(id) })} disabled={n === 0}
                onClick={() => ask({
                  titre: translate('admin.viderTitre'),
                  message: translate('admin.viderTexte', { count: translate('compte.rencontre', { count: n }), name: teamName(id) }),
                  run: () => clearClubStats(id),
                })} />
            )
          })}
          {matches.length === 0 && <Vide>{translate('admin.aucuneRencontre')}</Vide>}
        </Bloc>

        <Bloc titre={translate('admin.leReste')}>
          <Row libelle={translate('admin.resultatsLibelle')} count={translate('compte.resultat', { count: results.length })} action={translate('commun.supprimer')}
            aria={translate('admin.supprimerResultats')} disabled={results.length === 0}
            onClick={() => ask({
              titre: translate('admin.supprimerResultatsTitre'),
              message: translate('admin.supprimerResultatsTexte', { count: translate('compte.resultat', { count: results.length }) }),
              run: deleteAllResults,
            })} />
          <Row libelle={translate('admin.entrainementsDe', { name: club?.name ?? translate('admin.ceClub') })} count={translate('compte.seance', { count: sessions.length })} action={translate('commun.supprimer')}
            aria={translate('admin.supprimerEntrainements')} disabled={sessions.length === 0}
            onClick={() => ask({
              titre: translate('admin.supprimerEntrainementsTitre'),
              message: translate('admin.supprimerEntrainementsTexte', { count: translate('compte.seance', { count: sessions.length }), name: club?.name ?? translate('admin.ceClub') }),
              run: () => deleteTrainingsOfClub(clubId),
            })} />
          <Row libelle={translate('admin.schemasDe', { name: club?.name ?? translate('admin.ceClub') })} count={translate('compte.schema', { count: plays.length })} action={translate('commun.supprimer')}
            aria={translate('admin.supprimerSchemas')} disabled={plays.length === 0}
            onClick={() => ask({
              titre: translate('admin.supprimerSchemasTitre'),
              message: translate('admin.supprimerSchemasTexte', { count: translate('compte.schema', { count: plays.length }), name: club?.name ?? translate('admin.ceClub') }),
              run: () => deletePlaysOfClub(clubId),
            })} />
        </Bloc>

        {/* La remise à zéro à part, et derrière la recopie du nom du club : un clic
            unique n'est pas à la hauteur d'une action qui vide tout l'appareil. */}
        <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.accent }}>{translate('admin.toutEffacer')}</p>
          <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
            {translate('admin.remiseAZero')}
          </p>
          <Row
            libelle={translate('admin.toutesLesDonnees')}
            count={`${translate('compte.equipe', { count: teams.length })} · ${translate('compte.rencontre', { count: matches.length })} · ${translate('compte.resultat', { count: results.length })} · ${translate('compte.seance', { count: trainings.length })}`}
            action={translate('admin.toutEffacer')} aria={translate('admin.toutEffacer')} disabled={teams.length === 0 && matches.length === 0}
            onClick={() => ask({
              titre: translate('admin.toutEffacerTitre'),
              message: translate('admin.toutEffacerTexte', { teams: translate('compte.equipe', { count: teams.length }), games: translate('compte.rencontre', { count: matches.length }), results: translate('compte.resultat', { count: results.length }), sessions: translate('compte.seance', { count: trainings.length }) }),
              // Le nom du club, recopié à l'identique. Le repli n'arrive pas dans la
              // coquille (le club est résolu) : il est là pour qu'aucun chemin ne laisse
              // la remise à zéro se confirmer d'un seul clic.
              expectedInput: club?.name || 'EFFACER',
              run: async () => {
                await wipeAll()
                // Le club suivi disparaît avec ses données : sans cet oubli, l'appareil
                // resterait épinglé sur un club fantôme (cf. la fiche d'équipe).
                clear()
                navigate('/')
              },
            })} />
        </section>
      </div>

      <ConfirmDialog
        open={!!demande} danger
        title={demande?.titre ?? ''} message={demande?.message}
        expectedInput={demande?.expectedInput}
        confirmLabel={translate('admin.supprimerDefinitivement')}
        onConfirm={confirmer} onClose={() => setDemande(null)}
      />
    </div>
  )
}

/**
 * Le jeton d'écriture de la base partagée.
 *
 * Il est ici et non dans le dialogue des accès, parce qu'il n'est pas de la même
 * nature que les trois codes : ceux-là disent *qui vous êtes* et vivent le temps
 * d'un onglet ; celui-ci est un réglage d'appareil, posé une fois par la personne
 * qui a déployé, et vérifié par le serveur.
 *
 * Le bloc n'apparaît pas quand l'application tourne en local — il n'y aurait rien
 * à régler, et une porte qu'on ne peut pas ouvrir n'a pas à se montrer.
 */
function Synchronisation() {
  const translate = useT()
  const [value, setValue] = useState(token)
  const [etat, setEtat] = useState<State>(syncState)
  const [essai, setEssai] = useState(false)

  if (!remoteEnabled()) return null

  // On enregistre puis on essaie pour de bon, plutôt que d'annoncer « enregistré »
  // sur un jeton que le serveur refusera : c'est le genre de réglage qu'on pose
  // une fois et qu'on ne revient jamais vérifier.
  const verify = async () => {
    setToken(value.trim())
    setEssai(true)
    await hydrate()
    setEtat(syncState())
    setEssai(false)
  }

  const dit = essai ? 'admin.jetonEssai'
    : etat === 'ok' ? 'admin.jetonOk'
    : etat === 'token' ? 'admin.jetonRefuse'
    : etat === 'network' ? 'admin.jetonReseau'
    : 'admin.jetonInconnu'
  const mauvais = !essai && (etat === 'token' || etat === 'network')

  return (
    <Bloc titre={translate('admin.synchronisation')} aide={translate('admin.aideSynchronisation')}>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <input
          type="password" value={value} onChange={(e) => setValue(e.target.value)}
          aria-label={translate('admin.jeton')} placeholder={translate('admin.jeton')}
          className="min-w-[12rem] flex-1 rounded-xl px-4 py-3 text-sm outline-none transition focus:border-[var(--c-accent)]"
          style={{ background: C.panel, border: bd, color: C.text }}
        />
        <button onClick={verify} disabled={essai}
          className="rounded-xl px-5 py-3 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40"
          style={{ background: C.brand }}>
          {translate('admin.verifierJeton')}
        </button>
      </div>
      <p aria-live="polite" className="pb-1 text-[13px] font-semibold"
        style={{ color: mauvais ? C.danger : etat === 'ok' ? C.green : C.muted }}>
        {translate(dit)}
      </p>
    </Bloc>
  )
}

function Bloc({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{titre}</p>
      {aide && <p className="mb-3 text-[13px]" style={{ color: C.muted }}>{aide}</p>}
      <ul className="space-y-1.5">{children}</ul>
    </section>
  )
}

/** Une opération : ce qu'elle vise, ce qu'elle détruit (compté), et son bouton.
 *  Le compte est toujours affiché, y compris à zéro — c'est lui qui explique
 *  pourquoi le bouton est éteint. */
function Row({ libelle, count, action, aria, disabled, onClick }: {
  libelle: string; count: string; action: string; aria: string; disabled: boolean; onClick: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: C.panel }}>
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{libelle}</span>
      <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: C.muted }}>{count}</span>
      <button
        onClick={onClick} disabled={disabled} aria-label={aria}
        className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
        style={{ border: `1px solid ${C.accentBd}`, color: C.accent }}
      >
        {action}
      </button>
    </li>
  )
}

function Vide({ children }: { children: React.ReactNode }) {
  return <li className="py-2 text-sm" style={{ color: C.muted }}>{children}</li>
}
