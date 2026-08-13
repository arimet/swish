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
import { useNavigate } from 'react-router-dom'
import { annees, aVider, championnats, clubsDesRencontres, deLAnnee, duChampionnat } from '../../domain/menage'
import type { Match, ReportedResult, Training } from '../../domain/types'
import type { Schema } from '../../domain/plays'
import {
  clearClubStats, deleteAllResults, deleteMatchesWhere, deletePlaysOfClub, deleteTrainingsOfClub,
  listMatches, listPlays, listResults, listTrainings, wipeAll,
} from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, PageTitle } from '../olive/kit'

/** Une opération de ménage prête à être confirmée : ce qu'elle annonce, et ce
 *  qu'elle fait. Rien n'est exécuté avant la confirmation. */
interface Operation {
  titre: string
  message: string
  /** Texte à recopier pour confirmer — réservé à la remise à zéro complète. */
  saisieAttendue?: string
  executer: () => Promise<unknown>
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export function Admin() {
  const { clubId, club, teams, clear } = useClub()
  const { guard } = useAuth()
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

  const nomEquipe = useCallback((id: string) => teams.find((t) => t.id === id)?.name ?? 'Équipe', [teams])
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
    titre: 'Supprimer ces rencontres ?',
    message: `Les ${pluriel(n, 'rencontre')} de ${libellé}, leurs feuilles et leurs convocations seront supprimées. Cette action est définitive.`,
    executer: () => deleteMatchesWhere(filtre),
  })

  // La coquille ne monte cet écran que derrière un club résolu ; la branche sans
  // club évite un `clubId!` dans chaque opération qui en dépend.
  if (!clubId) return null

  return (
    <div className="p-6">
      <PageTitle subtitle="Le ménage de fin de saison : supprimer en bloc ce qui n’a plus lieu d’être." />

      <p className="mb-6 rounded-2xl px-4 py-3 text-sm" style={{ background: C.accentBg, color: C.pink }}>
        Ces suppressions sont définitives : il n’y a pas de corbeille, et résultats, convocations,
        entraînements et schémas ne sont pas synchronisés — ce qui est effacé ici n’existe plus nulle part.
      </p>

      <div className="space-y-6">
        <Bloc titre="Rencontres d’un championnat" aide="Les convocations attachées partent avec elles.">
          {championnats(matches).map((champ) => {
            const n = matches.filter(duChampionnat(champ)).length
            return (
              <Ligne key={champ} libelle={champ} compte={pluriel(n, 'rencontre')} action="Supprimer"
                aria={`Supprimer les rencontres de ${champ}`} desactive={n === 0}
                onClick={() => supprimerRencontres(`« ${champ} »`, duChampionnat(champ), n)} />
            )
          })}
          {matches.length === 0 && <Vide>Aucune rencontre enregistrée.</Vide>}
        </Bloc>

        <Bloc
          titre="Rencontres d’une année civile"
          aide="L’application ne connaît pas la saison sportive : rien dans les données ne porte le découpage août–juin. Le regroupement se fait par année civile, et une rencontre sans date n’est jamais emportée."
        >
          {annees(matches).map((an) => {
            const n = matches.filter(deLAnnee(an)).length
            return (
              <Ligne key={an} libelle={`Année ${an}`} compte={pluriel(n, 'rencontre')} action="Supprimer"
                aria={`Supprimer les rencontres de l’année ${an}`} desactive={n === 0}
                onClick={() => supprimerRencontres(`l’année civile ${an}`, deLAnnee(an), n)} />
            )
          })}
          {annees(matches).length === 0 && <Vide>Aucune rencontre datée.</Vide>}
        </Bloc>

        <Bloc titre="Statistiques d’une équipe" aide="Vider les feuilles : les rencontres et leurs dates restent, seuls les évènements enregistrés (paniers, fautes, temps de jeu) sont effacés. Pour supprimer les rencontres elles-mêmes, voir plus haut.">
          {clubsDesRencontres(matches).map((id) => {
            const n = matches.filter(aVider(id)).length
            return (
              <Ligne key={id} libelle={nomEquipe(id)} compte={`${pluriel(n, 'feuille')} à vider`} action="Vider"
                aria={`Vider les feuilles de ${nomEquipe(id)}`} desactive={n === 0}
                onClick={() => demander({
                  titre: 'Vider les feuilles ?',
                  message: `Les évènements enregistrés de ${pluriel(n, 'rencontre')} de « ${nomEquipe(id)} » seront effacés. Les rencontres et leurs dates restent. Cette action est définitive.`,
                  executer: () => clearClubStats(id),
                })} />
            )
          })}
          {matches.length === 0 && <Vide>Aucune rencontre enregistrée.</Vide>}
        </Bloc>

        <Bloc titre="Le reste, en bloc">
          <Ligne libelle="Résultats saisis du championnat" compte={pluriel(results.length, 'résultat')} action="Supprimer"
            aria="Supprimer les résultats saisis" desactive={results.length === 0}
            onClick={() => demander({
              titre: 'Supprimer les résultats saisis ?',
              message: `Les ${pluriel(results.length, 'résultat')} relevés à la main seront supprimés. Le classement ne portera plus que sur nos propres rencontres. Cette action est définitive.`,
              executer: deleteAllResults,
            })} />
          <Ligne libelle={`Entraînements de ${club?.name ?? 'ce club'}`} compte={pluriel(séances.length, 'séance')} action="Supprimer"
            aria="Supprimer les entraînements" desactive={séances.length === 0}
            onClick={() => demander({
              titre: 'Supprimer les entraînements ?',
              message: `Les ${pluriel(séances.length, 'séance')} de « ${club?.name ?? 'ce club'} » seront supprimées. Cette action est définitive.`,
              executer: () => deleteTrainingsOfClub(clubId),
            })} />
          <Ligne libelle={`Schémas de ${club?.name ?? 'ce club'}`} compte={pluriel(plays.length, 'schéma')} action="Supprimer"
            aria="Supprimer les schémas" desactive={plays.length === 0}
            onClick={() => demander({
              titre: 'Supprimer les schémas ?',
              message: `Les ${pluriel(plays.length, 'schéma')} de « ${club?.name ?? 'ce club'} » seront supprimés, et retirés des entraînements qui les travaillaient. Cette action est définitive.`,
              executer: () => deletePlaysOfClub(clubId),
            })} />
        </Bloc>

        {/* La remise à zéro à part, et derrière la recopie du nom du club : un clic
            unique n'est pas à la hauteur d'une action qui vide tout l'appareil. */}
        <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.pink}55` }}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.pink }}>Tout effacer</p>
          <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
            Remise à zéro complète de cet appareil : équipes, joueurs, rencontres, résultats,
            convocations, entraînements et schémas. L’application repart sur l’écran de bienvenue.
          </p>
          <Ligne
            libelle="Toutes les données de cet appareil"
            compte={`${pluriel(teams.length, 'équipe')} · ${pluriel(matches.length, 'rencontre')} · ${pluriel(results.length, 'résultat')} · ${pluriel(trainings.length, 'séance')}`}
            action="Tout effacer" aria="Tout effacer" desactive={teams.length === 0 && matches.length === 0}
            onClick={() => demander({
              titre: 'Tout effacer ?',
              message: `Toutes les données de cet appareil seront supprimées : ${pluriel(teams.length, 'équipe')} et leurs joueurs, ${pluriel(matches.length, 'rencontre')}, ${pluriel(results.length, 'résultat')} saisis, ${pluriel(trainings.length, 'séance')} et tous les schémas. Cette action est définitive.`,
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
        confirmLabel="Supprimer définitivement"
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
        style={{ border: `1px solid ${C.pink}55`, color: C.pink }}
      >
        {action}
      </button>
    </li>
  )
}

function Vide({ children }: { children: React.ReactNode }) {
  return <li className="py-2 text-sm" style={{ color: C.muted }}>{children}</li>
}
