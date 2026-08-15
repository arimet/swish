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
import { annees, aVider, championnats, clubsDesRencontres, deLAnnee, duChampionnat } from '../../domain/menage'
import type { Match, ReportedResult, Training } from '../../domain/types'
import type { Schema } from '../../domain/plays'
import {
  clearClubStats, deleteAllResults, deleteMatchesWhere, deletePlaysOfClub, deleteTrainingsOfClub,
  listMatches, listPlays, listResults, listTrainings, wipeAll,
} from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, useChampLabel } from '../olive/kit'

/** Une opération de ménage prête à être confirmée : ce qu'elle annonce, et ce
 *  qu'elle fait. Rien n'est exécuté avant la confirmation. */
interface Operation {
  titre: string
  message: string
  /** Texte à recopier pour confirmer — réservé à la remise à zéro complète. */
  saisieAttendue?: string
  executer: () => Promise<unknown>
}

/* Le pluriel passe par le catalogue : l'ancien helper accolait un « s » au mot
   français, ce qui ne se traduit pas — l'anglais n'accorde pas les mêmes mots au même
   endroit, et « feuille/feuilles » n'a pas de correspondance mécanique en anglais. */

export function Admin() {
  const trad = useT()
  const { clubId, club, teams, clear } = useClub()
  const { can, guard } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<Match[]>([])
  const [results, setResults] = useState<ReportedResult[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [plays, setPlays] = useState<Schema[]>([])
  // L'opération dont on a demandé la confirmation. Le droit est vérifié à
  // l'ouverture du dialogue, comme sur la fiche d'équipe et la bibliothèque.
  const [demande, setDemande] = useState<Operation | null>(null)

  const recharger = useCallback(async () => {
    const [ms, rs, ts, ps] = await Promise.all([listMatches(), listResults(), listTrainings(), clubId ? listPlays(clubId) : []])
    setMatches(ms); setResults(rs); setTrainings(ts); setPlays(ps)
  }, [clubId])
  useEffect(() => { recharger() }, [recharger])

  /* « Match amical » est la valeur stockée pour une rencontre sans championnat, et
     elle sert de clef de regroupement ici : on la traduit au moment de l'écrire, pas
     avant, sinon les deux langues découperaient deux groupes différents. */
  const nomChamp = useChampLabel()
  const nomEquipe = useCallback((id: string) => teams.find((t) => t.id === id)?.name ?? trad('commun.equipe'), [teams, trad])
  const séances = useMemo(() => trainings.filter((t) => t.clubId === clubId), [trainings, clubId])

  // Garder d'abord, muter ensuite : la table de marque ne voit pas s'ouvrir un
  // dialogue de confirmation qu'elle n'aurait pas le droit de valider.
  const demander = (op: Operation) => guard('manage', () => setDemande(op))
  const confirmer = async () => {
    if (!demande) return
    await demande.executer()
    await recharger()
  }

  const supprimerRencontres = (libellé: string, filtre: (m: Match) => boolean, n: number) => demander({
    titre: trad('admin.supprimerRencontresTitre'),
    message: trad('admin.supprimerRencontresTexte', { compte: trad('compte.rencontre', { count: n }), libelle: libellé }),
    executer: () => deleteMatchesWhere(filtre),
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
        {trad('admin.avertissement')}
      </p>

      <div className="space-y-6">
        <Bloc titre={trad('admin.parChampionnat')} aide={trad('admin.aideChampionnat')}>
          {championnats(matches).map((champ) => {
            const n = matches.filter(duChampionnat(champ)).length
            return (
              <Ligne key={champ} libelle={nomChamp(champ)} compte={trad('compte.rencontre', { count: n })} action={trad('commun.supprimer')}
                aria={trad('admin.supprimerRencontresDe', { quoi: nomChamp(champ) })} desactive={n === 0}
                onClick={() => supprimerRencontres(`« ${nomChamp(champ)} »`, duChampionnat(champ), n)} />
            )
          })}
          {matches.length === 0 && <Vide>{trad('admin.aucuneRencontre')}</Vide>}
        </Bloc>

        <Bloc titre={trad('admin.parAnnee')} aide={trad('admin.aideAnnee')}>
          {annees(matches).map((an) => {
            const n = matches.filter(deLAnnee(an)).length
            return (
              <Ligne key={an} libelle={trad('admin.annee', { an })} compte={trad('compte.rencontre', { count: n })} action={trad('commun.supprimer')}
                aria={trad('admin.supprimerRencontresAnnee', { an })} desactive={n === 0}
                onClick={() => supprimerRencontres(trad('admin.anneeCivile', { an }), deLAnnee(an), n)} />
            )
          })}
          {annees(matches).length === 0 && <Vide>{trad('admin.aucuneRencontreDatee')}</Vide>}
        </Bloc>

        <Bloc titre={trad('admin.statsEquipe')} aide={trad('admin.aideStats')}>
          {clubsDesRencontres(matches).map((id) => {
            const n = matches.filter(aVider(id)).length
            return (
              <Ligne key={id} libelle={nomEquipe(id)} compte={trad('admin.aVider', { compte: trad('compte.feuille', { count: n }) })} action={trad('admin.vider')}
                aria={trad('admin.viderFeuillesDe', { nom: nomEquipe(id) })} desactive={n === 0}
                onClick={() => demander({
                  titre: trad('admin.viderTitre'),
                  message: trad('admin.viderTexte', { compte: trad('compte.rencontre', { count: n }), nom: nomEquipe(id) }),
                  executer: () => clearClubStats(id),
                })} />
            )
          })}
          {matches.length === 0 && <Vide>{trad('admin.aucuneRencontre')}</Vide>}
        </Bloc>

        <Bloc titre={trad('admin.leReste')}>
          <Ligne libelle={trad('admin.resultatsLibelle')} compte={trad('compte.resultat', { count: results.length })} action={trad('commun.supprimer')}
            aria={trad('admin.supprimerResultats')} desactive={results.length === 0}
            onClick={() => demander({
              titre: trad('admin.supprimerResultatsTitre'),
              message: trad('admin.supprimerResultatsTexte', { compte: trad('compte.resultat', { count: results.length }) }),
              executer: deleteAllResults,
            })} />
          <Ligne libelle={trad('admin.entrainementsDe', { nom: club?.name ?? trad('admin.ceClub') })} compte={trad('compte.seance', { count: séances.length })} action={trad('commun.supprimer')}
            aria={trad('admin.supprimerEntrainements')} desactive={séances.length === 0}
            onClick={() => demander({
              titre: trad('admin.supprimerEntrainementsTitre'),
              message: trad('admin.supprimerEntrainementsTexte', { compte: trad('compte.seance', { count: séances.length }), nom: club?.name ?? trad('admin.ceClub') }),
              executer: () => deleteTrainingsOfClub(clubId),
            })} />
          <Ligne libelle={trad('admin.schemasDe', { nom: club?.name ?? trad('admin.ceClub') })} compte={trad('compte.schema', { count: plays.length })} action={trad('commun.supprimer')}
            aria={trad('admin.supprimerSchemas')} desactive={plays.length === 0}
            onClick={() => demander({
              titre: trad('admin.supprimerSchemasTitre'),
              message: trad('admin.supprimerSchemasTexte', { compte: trad('compte.schema', { count: plays.length }), nom: club?.name ?? trad('admin.ceClub') }),
              executer: () => deletePlaysOfClub(clubId),
            })} />
        </Bloc>

        {/* La remise à zéro à part, et derrière la recopie du nom du club : un clic
            unique n'est pas à la hauteur d'une action qui vide tout l'appareil. */}
        <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.accent }}>{trad('admin.toutEffacer')}</p>
          <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
            {trad('admin.remiseAZero')}
          </p>
          <Ligne
            libelle={trad('admin.toutesLesDonnees')}
            compte={`${trad('compte.equipe', { count: teams.length })} · ${trad('compte.rencontre', { count: matches.length })} · ${trad('compte.resultat', { count: results.length })} · ${trad('compte.seance', { count: trainings.length })}`}
            action={trad('admin.toutEffacer')} aria={trad('admin.toutEffacer')} desactive={teams.length === 0 && matches.length === 0}
            onClick={() => demander({
              titre: trad('admin.toutEffacerTitre'),
              message: trad('admin.toutEffacerTexte', { equipes: trad('compte.equipe', { count: teams.length }), rencontres: trad('compte.rencontre', { count: matches.length }), resultats: trad('compte.resultat', { count: results.length }), seances: trad('compte.seance', { count: trainings.length }) }),
              // Le nom du club, recopié à l'identique. Le repli n'arrive pas dans la
              // coquille (le club est résolu) : il est là pour qu'aucun chemin ne laisse
              // la remise à zéro se confirmer d'un seul clic.
              saisieAttendue: club?.name || 'EFFACER',
              executer: async () => {
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
        saisieAttendue={demande?.saisieAttendue}
        confirmLabel={trad('admin.supprimerDefinitivement')}
        onConfirm={confirmer} onClose={() => setDemande(null)}
      />
    </div>
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
function Ligne({ libelle, compte, action, aria, desactive, onClick }: {
  libelle: string; compte: string; action: string; aria: string; desactive: boolean; onClick: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: C.panel }}>
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{libelle}</span>
      <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: C.muted }}>{compte}</span>
      <button
        onClick={onClick} disabled={desactive} aria-label={aria}
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
