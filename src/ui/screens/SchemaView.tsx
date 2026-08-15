/**
 * La consultation d'un schéma : le tableau en grand, un temps à la fois, qu'on
 * fait défiler à la main. Aucun code n'est demandé pour lire — un joueur revoit
 * la combinaison chez lui. Seul « Modifier » écrit : il réclame l'accès
 * administrateur, et ne s'affiche que pour qui l'a.
 * Le lecteur animé viendra en 8B ; ici, c'est le doigt qui avance.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Play } from '../../domain/plays'
import { getPlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { ExportSchema } from '../components/ExportSchema'
import { courtWidth, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

export function SchemaView() {
  const translate = useT()
  const { id } = useParams<{ id: string }>()
  const { can, guard } = useAuth()
  const navigate = useNavigate()
  const [schema, setSchema] = useState<Play | null | undefined>(undefined)
  const [index, setIndex] = useState(0)
  const [partage, setPartage] = useState(false)

  useEffect(() => { if (id) getPlay(id).then((s) => setSchema(s ?? null)) }, [id])

  if (!id) return null
  if (schema === undefined) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (schema === null) return (
    <div className="p-6">
      <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
        {translate('sch.introuvable')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{translate('equipe.retour')}</Link>
      </p>
    </div>
  )

  const last = schema.temps.length - 1
  // Le défilement se borne, il ne boucle pas : revenir au premier temps après le
  // dernier laisserait croire qu'il en reste à voir.
  const aller = (delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta)))
  const modifier = () => guard('manage', () => navigate(`/schemas/${id}/edit`))

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/schemas" aria-label={translate('sch.retourSchemas')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold" style={{ border: bd, color: C.muted }}>←</Link>
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{schema.nom}</h1>
          {/* Les mêmes marques que sur la carte de la bibliothèque : on reconnaît
              d'un coup d'œil le schéma qu'on vient d'ouvrir. */}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] font-bold" style={{ color: C.muted }}>
            <span className="rounded-md px-1.5 py-0.5" style={{ background: C.card2 }}>
              {translate(schema.court === 'half' ? 'sch.demiTerrain' : 'sch.terrainComplet')}
            </span>
            <span>{translate('sch.compteTemps', { count: schema.temps.length })}</span>
            {schema.defense && <span>{translate('sch.defense')}</span>}
          </p>
        </div>
        {/* Un seul bouton plein par écran : « Jouer », ce qu'on vient chercher au
            bord du terrain, et c'est libre. Partager l'est aussi — rien n'est
            modifié, un joueur doit pouvoir envoyer la combinaison à un coéquipier ;
            il reste en contour, comme Modifier — qui garde son code administrateur
            et ne se rend que pour qui le possède. */}
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setPartage(true)} className="h-11 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}>{translate('sch.partager')}</button>
          {can('manage') && <button onClick={modifier} className="h-11 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}>{translate('commun.modifierMaj')}</button>}
          <Link to={`/schemas/${id}/lecteur`} className="flex h-11 items-center rounded-xl px-4 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('sch.jouer')}</Link>
        </div>
      </div>

      {/* Le temps affiché est celui que l'image reprendra : on partage ce qu'on regarde. */}
      <ExportSchema schema={schema} tempsIndex={index} open={partage} onClose={() => setPartage(false)} />

      {schema.note && <p className="mb-4 rounded-2xl p-4 text-sm" style={{ background: C.card, border: bd, color: C.muted }}>{schema.note}</p>}

      {/* Même bornage de largeur que l'éditeur : c'est le rapport du viewBox qui
          doit tenir, le demi-terrain déborderait sinon sur un écran large. */}
      <div className="select-none" style={{ maxWidth: courtWidth(schema.court) }}>
        <PlayBoard schema={schema} tempsIndex={index} />
      </div>

      {/* Le défilement des temps, calé sur la largeur du terrain qu'il commande, et
          doublé d'une jauge : un compteur dit où l'on est, la jauge dit combien il
          en reste — deux questions qu'on se pose en même temps. */}
      <div className="mt-3 select-none" style={{ maxWidth: courtWidth(schema.court) }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => aller(-1)} aria-label={translate('lecteur.precedent')} disabled={index === 0}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-black disabled:opacity-30" style={{ background: C.card, border: bd, color: C.text }}
          >
            ◀
          </button>
          <span className="flex-1 text-center text-sm font-extrabold">{translate('sch.temps', { n: index + 1, total: schema.temps.length })}</span>
          <button
            onClick={() => aller(1)} aria-label={translate('lecteur.suivant')} disabled={index === last}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-black disabled:opacity-30" style={{ background: C.card, border: bd, color: C.text }}
          >
            ▶
          </button>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {schema.temps.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full transition" style={{ background: i <= index ? C.accent : C.card2 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
