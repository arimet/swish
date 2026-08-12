/**
 * La bibliothèque des combinaisons du club. Chaque carte montre la vignette du
 * premier temps : un coach reconnaît sa combinaison à sa forme, pas à son nom.
 * La lecture est libre ; créer, dupliquer et supprimer passent par le code
 * administrateur.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { nouveauSchema, type Schema } from '../../domain/plays'
import { deletePlay, listPlays, savePlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { PlayBoard } from '../components/PlayBoard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, PageTitle } from '../olive/kit'

export function SchemaList() {
  const { clubId } = useClub()
  const { guard } = useAuth()
  const navigate = useNavigate()
  const [schemas, setSchemas] = useState<Schema[] | null>(null)
  // Le schéma dont on a demandé la suppression : le droit est vérifié à
  // l'ouverture du dialogue, comme sur la fiche d'équipe.
  const [aSupprimer, setASupprimer] = useState<Schema | null>(null)

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schemas.map((s) => (
            <article key={s.id} className="flex flex-col rounded-2xl p-3" style={{ background: C.card, border: bd }}>
              {/* La vignette et le nom mènent à la consultation ; les deux boutons
                  restent hors du lien, un bouton dans un lien n'est pas cliquable. */}
              <Link to={`/schemas/${s.id}`} className="block transition hover:-translate-y-0.5">
                <PlayBoard schema={s} tempsIndex={0} apercu />
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
