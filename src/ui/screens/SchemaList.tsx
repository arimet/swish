/**
 * La bibliothèque des combinaisons du club. Chaque carte montre la vignette du
 * premier temps : un coach reconnaît sa combinaison à sa forme, pas à son nom.
 * Vingt combinaisons, c'est le moment où l'on range : une barre de dossiers, une
 * recherche, et le plus récemment modifié en tête.
 * La lecture est libre — chercher et filtrer ne demandent aucun code ; créer,
 * dupliquer, ranger et supprimer passent par le code administrateur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { dossiers, nouveauSchema, type Schema } from '../../domain/plays'
import { deletePlay, listPlays, savePlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { PlayBoard } from '../components/PlayBoard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, PageTitle } from '../olive/kit'

/** Sans casse ni accents : au bord du terrain on tape « defense » et l'on veut
 *  trouver « défense ». */
const sansAccents = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Le dossier d'un schéma, normalisé. Chaîne vide = « Sans dossier », ce qui sert
 *  aussi d'onglet : un vrai dossier n'est jamais vide (cf. `dossiers`). */
const dossierDe = (s: Schema) => s.dossier?.trim() ?? ''

const DATALIST = 'dossiers-connus'

export function SchemaList() {
  const { clubId } = useClub()
  const { guard } = useAuth()
  const navigate = useNavigate()
  const [schemas, setSchemas] = useState<Schema[] | null>(null)
  // Le schéma dont on a demandé la suppression : le droit est vérifié à
  // l'ouverture du dialogue, comme sur la fiche d'équipe.
  const [aSupprimer, setASupprimer] = useState<Schema | null>(null)
  // `null` = onglet « Tous », `''` = « Sans dossier », sinon le nom du dossier.
  const [dossierActif, setDossierActif] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  // Le schéma dont on saisit le dossier, et la valeur en cours de frappe.
  const [enRangement, setEnRangement] = useState<{ id: string; valeur: string } | null>(null)

  const recharger = useCallback(() => {
    if (clubId) listPlays(clubId).then(setSchemas)
  }, [clubId])
  useEffect(() => { recharger() }, [recharger])

  // Garder d'abord, écrire ensuite : le schéma n'est créé qu'une fois le droit
  // acquis, sinon un visiteur laisserait des schémas vides derrière ses refus.
  const creer = () => guard('manage', async () => {
    if (!clubId) return
    const s: Schema = { id: newId(), ...nouveauSchema(clubId, 'demi', false) }
    await savePlay(s)
    navigate(`/schemas/${s.id}/edit`)
  })

  const dupliquer = (s: Schema) => guard('manage', async () => {
    // Copie profonde : les temps et leurs flèches sont partagés sinon, et
    // retoucher la copie modifierait l'original.
    await savePlay({ ...structuredClone(s), id: newId(), nom: `${s.nom} (copie)` })
    recharger()
  })

  const supprimer = async () => {
    if (!aSupprimer) return
    await deletePlay(aSupprimer.id)
    recharger()
  }

  // Garder d'abord, muter ensuite : la table de marque n'ouvre même pas la
  // saisie, plutôt que de taper un dossier pour se voir refuser à l'envoi.
  const ouvrirRangement = (s: Schema) => guard('manage', () => setEnRangement({ id: s.id, valeur: dossierDe(s) }))
  const ranger = (s: Schema) => guard('manage', async () => {
    const valeur = enRangement?.valeur.trim()
    await savePlay({ ...s, dossier: valeur || undefined })
    setEnRangement(null)
    recharger()
  })

  const tous = useMemo(() => schemas ?? [], [schemas])
  const listeDossiers = useMemo(() => dossiers(tous), [tous])
  const aDesNonRanges = tous.some((s) => !dossierDe(s))

  // Filtrer puis ranger : le dossier actif, la recherche sur le nom et la note,
  // et l'ordre du plus récemment modifié au plus ancien. Les schémas d'avant
  // l'horodatage n'ont pas de `majLe` ; la chaîne vide les envoie en dernier
  // sans jamais comparer un `undefined`.
  const visibles = useMemo(() => {
    const q = sansAccents(recherche.trim())
    return tous
      .filter((s) => dossierActif === null || dossierDe(s) === dossierActif)
      .filter((s) => !q || sansAccents(`${s.nom} ${s.note ?? ''}`).includes(q))
      .sort((a, b) => (b.majLe ?? '').localeCompare(a.majLe ?? ''))
  }, [tous, dossierActif, recherche])

  return (
    <div className="p-6">
      <PageTitle
        title="Schémas" subtitle="Les combinaisons de votre club, à revoir avant l’entraînement."
        action={
          <button onClick={creer} className="rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
            + Nouveau schéma
          </button>
        }
      />

      {schemas === null ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : schemas.length === 0 ? (
        <div className="rounded-2xl py-16 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>Aucun schéma pour l’instant.</p>
          <button onClick={creer} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
            Dessiner ma première combinaison →
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* Les onglets se déduisent des schémas : un dossier vidé disparaît de
                lui-même, et « Sans dossier » ne s'affiche que s'il reste à ranger. */}
            <div role="group" aria-label="Dossiers" className="flex flex-wrap gap-1.5">
              <Onglet actif={dossierActif === null} onClick={() => setDossierActif(null)}>Tous</Onglet>
              {listeDossiers.map((d) => (
                <Onglet key={d} actif={dossierActif === d} onClick={() => setDossierActif(d)}>{d}</Onglet>
              ))}
              {aDesNonRanges && <Onglet actif={dossierActif === ''} onClick={() => setDossierActif('')}>Sans dossier</Onglet>}
            </div>
            <input
              type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher un schéma" placeholder="Rechercher (nom ou note)…"
              className="ml-auto w-full rounded-xl px-3 py-2 text-sm sm:w-64"
              style={{ background: C.panel, border: bd, color: C.text }}
            />
          </div>

          {/* Une seule liste de suggestions pour toutes les cartes : elle évite les
              doublons d'orthographe sans imposer une gestion de dossiers. */}
          <datalist id={DATALIST}>{listeDossiers.map((d) => <option key={d} value={d} />)}</datalist>

          {visibles.length === 0 ? (
            <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
              Aucun schéma ne correspond à cette recherche.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
              {visibles.map((s) => (
                <article key={s.id} className="flex flex-col rounded-2xl p-3" style={{ background: C.card, border: bd }}>
                  {/* La vignette et le nom mènent à la consultation ; les boutons
                      restent hors du lien, un bouton dans un lien n'est pas cliquable. */}
                  <Link to={`/schemas/${s.id}`} className="block transition hover:-translate-y-0.5">
                    {/* Hauteur fixe, quel que soit le terrain : à suivre son rapport, la
                        vignette d'un terrain complet ferait le double des autres, la grille
                        alignerait la rangée sur elle et la couperait en bas. Le SVG se cale
                        dans la boîte sans distorsion (`preserveAspectRatio`) — un terrain
                        complet apparaît donc plus étroit, ce qui se lit très bien. Aucune
                        conversion de pointeur ici : `remplit` est sans danger. */}
                    <div className="h-[150px]">
                      <PlayBoard schema={s} tempsIndex={0} apercu remplit />
                    </div>
                    <h3 className="mt-2.5 truncate text-[15px] font-extrabold tracking-tight">{s.nom}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold" style={{ color: C.muted }}>
                      <span className="rounded-md px-1.5 py-0.5" style={{ background: C.card2 }}>
                        {s.terrain === 'demi' ? 'Demi-terrain' : 'Terrain complet'}
                      </span>
                      <span>{s.temps.length} temps</span>
                      {s.defense && <span>· défense</span>}
                    </p>
                    {s.note && <p className="mt-1 truncate text-[11px]" style={{ color: C.faint }}>{s.note}</p>}
                  </Link>

                  <div className="mt-2 text-[11px] font-bold">
                    {enRangement?.id === s.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(e) => { e.preventDefault(); ranger(s) }}
                      >
                        <input
                          list={DATALIST} aria-label="Dossier" autoFocus value={enRangement.valeur}
                          onChange={(e) => setEnRangement({ id: s.id, valeur: e.target.value })}
                          placeholder="Nom du dossier" className="min-w-0 flex-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                          style={{ background: C.panel, border: bd, color: C.text }}
                        />
                        <button type="submit" className="rounded-lg px-2 py-1" style={{ color: C.accent }}>Ranger</button>
                      </form>
                    ) : (
                      <button
                        onClick={() => ouvrirRangement(s)} aria-label={`Dossier de « ${s.nom} »`}
                        className="rounded-md px-1.5 py-0.5" style={{ background: C.card2, color: s.dossier ? C.accent : C.faint }}
                      >
                        {s.dossier || 'Sans dossier'}
                      </button>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-end gap-2 border-t pt-2.5 text-[11px] font-bold" style={{ borderColor: C.border }}>
                    {/* Jouer depuis la carte : au bord du terrain on ouvre le lecteur
                        sans passer par la fiche. */}
                    <Link to={`/schemas/${s.id}/lecteur`} className="mr-auto rounded-lg px-2 py-1" style={{ color: C.accent }}>▶ Jouer</Link>
                    <button onClick={() => dupliquer(s)} className="rounded-lg px-2 py-1" style={{ color: C.muted }}>Dupliquer</button>
                    <button onClick={() => guard('manage', () => setASupprimer(s))} className="rounded-lg px-2 py-1" style={{ color: C.pink }}>Supprimer</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* Même formulation que les entraînements et les résultats extérieurs :
          une seule limite à retenir, pas une par écran. */}
      <p className="mt-8 text-[11px]" style={{ color: C.faint }}>Ces schémas restent sur cet appareil : ils ne sont pas synchronisés avec vos autres appareils.</p>

      <ConfirmDialog
        open={!!aSupprimer} danger
        title="Supprimer le schéma ?"
        message={aSupprimer ? `« ${aSupprimer.nom} » et tous ses temps seront supprimés. Cette action est définitive.` : undefined}
        confirmLabel="Supprimer" onConfirm={supprimer} onClose={() => setASupprimer(null)}
      />
    </div>
  )
}

function Onglet({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} aria-pressed={actif}
      className="rounded-lg px-3 py-1.5 text-[12px] font-bold"
      style={actif ? { background: C.accent, color: '#fff' } : { background: C.card2, color: C.muted, border: bd }}
    >
      {children}
    </button>
  )
}
