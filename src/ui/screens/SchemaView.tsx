/**
 * La consultation d'un schéma : le tableau en grand, un temps à la fois, qu'on
 * fait défiler à la main. Aucun code n'est demandé pour lire — un joueur revoit
 * la combinaison chez lui. Seul « Modifier » réclame l'accès administrateur.
 * Le lecteur animé viendra en 8B ; ici, c'est le doigt qui avance.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Schema } from '../../domain/plays'
import { getPlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { ExportSchema } from '../components/ExportSchema'
import { largeurTerrain, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

export function SchemaView() {
  const { id } = useParams<{ id: string }>()
  const { guard } = useAuth()
  const navigate = useNavigate()
  const [schema, setSchema] = useState<Schema | null | undefined>(undefined)
  const [index, setIndex] = useState(0)
  const [partage, setPartage] = useState(false)

  useEffect(() => { if (id) getPlay(id).then((s) => setSchema(s ?? null)) }, [id])

  if (!id) return null
  if (schema === undefined) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (schema === null) return (
    <div className="p-6">
      <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
        Schéma introuvable. <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>← Retour</Link>
      </p>
    </div>
  )

  const dernier = schema.temps.length - 1
  // Le défilement se borne, il ne boucle pas : revenir au premier temps après le
  // dernier laisserait croire qu'il en reste à voir.
  const aller = (delta: number) => setIndex((i) => Math.min(dernier, Math.max(0, i + delta)))
  const modifier = () => guard('manage', () => navigate(`/schemas/${id}/edit`))

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/schemas" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>← Schémas</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{schema.nom}</h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {schema.terrain === 'demi' ? 'Demi-terrain' : 'Terrain complet'} · {schema.temps.length} temps{schema.defense ? ' · défense' : ''}
          </p>
        </div>
        {/* Jouer d'abord : c'est ce qu'on vient chercher au bord du terrain, et
            c'est libre. Partager l'est aussi — rien n'est modifié, un joueur doit
            pouvoir envoyer la combinaison à un coéquipier. Modifier reste derrière
            le code administrateur. */}
        <Link to={`/schemas/${id}/lecteur`} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: C.accent }}>▶ Jouer</Link>
        <button onClick={() => setPartage(true)} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: bd, color: C.text }}>Partager</button>
        <button onClick={modifier} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: bd, color: C.text }}>Modifier</button>
      </div>

      {/* Le temps affiché est celui que l'image reprendra : on partage ce qu'on regarde. */}
      <ExportSchema schema={schema} tempsIndex={index} open={partage} onClose={() => setPartage(false)} />

      {schema.note && <p className="mb-4 rounded-2xl p-4 text-sm" style={{ background: C.card, border: bd, color: C.muted }}>{schema.note}</p>}

      {/* Même bornage de largeur que l'éditeur : c'est le rapport du viewBox qui
          doit tenir, le demi-terrain déborderait sinon sur un écran large. */}
      <div className="select-none" style={{ maxWidth: largeurTerrain(schema.terrain) }}>
        <PlayBoard schema={schema} tempsIndex={index} />
      </div>

      <div className="mt-3 flex select-none items-center gap-3" style={{ maxWidth: largeurTerrain(schema.terrain) }}>
        <button
          onClick={() => aller(-1)} aria-label="Temps précédent" disabled={index === 0}
          className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40" style={{ background: C.card, border: bd, color: C.text }}
        >
          ◀
        </button>
        <span className="flex-1 text-center text-sm font-extrabold">Temps {index + 1} / {schema.temps.length}</span>
        <button
          onClick={() => aller(1)} aria-label="Temps suivant" disabled={index === dernier}
          className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40" style={{ background: C.card, border: bd, color: C.text }}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
