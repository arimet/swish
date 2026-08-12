/**
 * La combinaison arrivée par un lien. Tout le schéma est dans le fragment de
 * l'URL : rien à installer, rien à synchroniser, aucun serveur à interroger.
 * D'où la place de cet écran — hors de la coquille et **hors du garde de club** :
 * celui qui reçoit le lien n'a peut-être jamais ouvert l'application, et le
 * renvoyer vers l'écran de bienvenue lui cacherait ce qu'on lui a envoyé.
 *
 * Lire est libre. Seul « Ajouter à ma bibliothèque » écrit, et passe donc par le
 * code administrateur.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { newId } from '../../domain/ids'
import { decoder } from '../../domain/partage'
import type { Schema } from '../../domain/plays'
import { savePlay } from '../../persistence/repositories'
import { PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

export function SchemaRecu() {
  const { hash } = useLocation()
  const { guard } = useAuth()
  const { clubId, ready } = useClub()
  const navigate = useNavigate()
  const [schema, setSchema] = useState<Schema | null | undefined>(undefined)
  const [index, setIndex] = useState(0)

  // `useLocation().hash` porte le « # » : le code commence au caractère suivant.
  const code = hash.slice(1)

  useEffect(() => {
    let vivant = true
    decoder(code).then((s) => { if (vivant) setSchema(s) })
    return () => { vivant = false }
  }, [code])

  if (schema === undefined) return <Ecran><p style={{ color: C.muted }}>Ouverture du lien…</p></Ecran>
  if (schema === null) return (
    <Ecran>
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-extrabold">Ce lien est incomplet ou abîmé.</p>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            Le schéma voyage entier dans le lien : une messagerie qui le coupe le rend illisible.
            Demandez qu’on vous le renvoie.
          </p>
          <Link to="/" className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
            Ouvrir Swish →
          </Link>
        </div>
      </div>
    </Ecran>
  )

  const dernier = schema.temps.length - 1
  // Le défilement se borne, il ne boucle pas — même règle que la consultation.
  const aller = (delta: number) => setIndex((i) => Math.min(dernier, Math.max(0, i + delta)))

  // Un schéma neuf : nouvel identifiant, club de celui qui reçoit. L'import ne
  // peut donc écraser aucun schéma existant, même si l'expéditeur et le
  // destinataire partagent la même base.
  const ajouter = () => guard('manage', async () => {
    if (!clubId) return
    const s: Schema = { ...schema, id: newId(), clubId }
    await savePlay(s)
    navigate(`/schemas/${s.id}`)
  })

  // Même bornage de largeur que la consultation : c'est le rapport du viewBox
  // qui doit tenir, le demi-terrain déborderait sinon sur un écran large.
  const large = schema.terrain === 'demi' ? '46vh' : undefined

  return (
    <Ecran>
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.accent }}>Combinaison reçue</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{schema.nom}</h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {schema.terrain === 'demi' ? 'Demi-terrain' : 'Terrain complet'} · {schema.temps.length} temps{schema.defense ? ' · défense' : ''}
          </p>
        </div>

        {schema.note && <p className="rounded-2xl p-4 text-sm" style={{ background: C.card, border: bd, color: C.muted }}>{schema.note}</p>}

        <div className="select-none" style={{ maxWidth: large }}>
          <PlayBoard schema={schema} tempsIndex={index} />
        </div>

        <div className="flex select-none items-center gap-3" style={{ maxWidth: large }}>
          <Pas label="Temps précédent" onClick={() => aller(-1)} disabled={index === 0}>◀</Pas>
          <span className="flex-1 text-center text-sm font-extrabold">Temps {index + 1} / {schema.temps.length}</span>
          <Pas label="Temps suivant" onClick={() => aller(1)} disabled={index === dernier}>▶</Pas>
        </div>

        {/* Tant que les équipes ne sont pas chargées, on ne sait pas si un club
            est réglé : proposer l'un ou l'autre trop tôt ferait clignoter l'écran. */}
        {ready && (clubId ? (
          <button onClick={ajouter} className="rounded-2xl py-3.5 text-sm font-black text-white" style={{ background: C.accent, maxWidth: large }}>
            + Ajouter à ma bibliothèque
          </button>
        ) : (
          <Link to="/" className="rounded-2xl py-3.5 text-center text-sm font-black text-white" style={{ background: C.accent, maxWidth: large }}>
            Choisir un club pour l’ajouter →
          </Link>
        ))}

        <p className="text-[11px]" style={{ color: C.faint }}>
          Ce lien contient la combinaison entière : il n’y a rien à installer, et il ne périme pas.
        </p>
      </div>
    </Ecran>
  )
}

/** Le fond plein du lecteur : ce lien s'ouvre le plus souvent sur un téléphone,
 *  hors de la coquille et de son menu. */
function Ecran({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

function Pas({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick} aria-label={label} disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
      style={{ background: C.card, border: bd, color: C.text }}
    >
      {children}
    </button>
  )
}
