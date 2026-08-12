/**
 * L'éditeur du tableau tactique. Le coach glisse ses pions, tire ses trajectoires
 * au doigt, gomme, annule, et empile les temps de sa combinaison. Chaque geste
 * abouti s'écrit en base sur-le-champ : il n'y a pas de bouton « Enregistrer »,
 * un coach au bord du terrain n'a pas une main pour ça.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  PANIER, distanceAuSegment, reduireTrace, tempsSuivant, versTerrain,
  type Camp, type Fleche, type ObjetPose, type Pion, type Point, type Poste, type Schema, type Temps, type Terrain, type Trait,
} from '../../domain/plays'
import { getPlay, savePlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { PlayBoard, versSvg } from '../components/PlayBoard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { D, W } from '../components/ShotCourt'
import { C, bd } from '../olive/kit'

type Outil = 'deplacer' | Trait | 'ballon' | 'objet' | 'gomme'
/** Ce qu'un glisser tient : un pion (par son camp et son poste), ou un objet posé
 *  (par son rang) — les deux se déplacent, rien d'autre ne bouge. */
type Prise = { sorte: 'pion'; camp: Camp; poste: Poste } | { sorte: 'objet'; index: number }
/**
 * Un pas d'annulation. Le brief prévoyait une pile de `Temps` ; on y joint les
 * objets, qui vivent hors des temps et que la gomme retire aussi — sans eux,
 * « annuler » ne rendrait pas le plot effacé.
 */
type Etape = { temps: Temps; objets: ObjetPose[] }

/** Rayon de prise, en unités normalisées : large au doigt, sans être ambigu —
 *  c'est le pion le plus proche qui l'emporte de toute façon. */
const PRISE = 0.05
/** Tolérance de la gomme à un tracé de flèche. */
const PRES_DU_TRAIT = 0.04
/** Un tracé plus court que ça est un tap manqué, pas une trajectoire. */
const TRACE_MINI = 0.03
/** Profondeur de la pile d'annulation, par temps. */
const PILE_MAX = 20

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Le pion le plus proche du doigt, dans le rayon de prise. */
function pionSous(t: Temps, p: Point): Pion | null {
  let trouve: Pion | null = null
  for (const pion of t.pions) {
    if (dist(pion.at, p) > PRISE) continue
    if (!trouve || dist(pion.at, p) < dist(trouve.at, p)) trouve = pion
  }
  return trouve
}

/** Rang de l'objet sous le doigt, -1 sinon. */
const objetSous = (objets: ObjetPose[], p: Point) => objets.findIndex((o) => dist(o.at, p) < PRISE)

/** Distance du doigt au tracé d'une flèche, segment par segment. */
function distanceAFleche(f: Fleche, p: Point): number {
  if (f.points.length < 2) return f.points.length ? dist(f.points[0], p) : Infinity
  let d = Infinity
  for (let i = 0; i < f.points.length - 1; i++) d = Math.min(d, distanceAuSegment(p, f.points[i], f.points[i + 1]))
  return d
}

/** Rang de la flèche la plus proche du doigt, -1 si aucune n'est assez près. */
function flecheSous(t: Temps, p: Point): number {
  let rang = -1
  let meilleure = PRES_DU_TRAIT
  t.fleches.forEach((f, i) => {
    const d = distanceAFleche(f, p)
    if (d < meilleure) { meilleure = d; rang = i }
  })
  return rang
}

/** Le schéma avec la prise posée à `at` : sert au rendu pendant le glisser et à
 *  l'écriture au relâcher, pour que l'aperçu et l'enregistré ne divergent pas. */
function deplace(s: Schema, tempsIndex: number, quoi: Prise, at: Point): Schema {
  if (quoi.sorte === 'objet') return { ...s, objets: s.objets.map((o, k) => (k === quoi.index ? { ...o, at } : o)) }
  return {
    ...s,
    temps: s.temps.map((t, k) => (k !== tempsIndex ? t : {
      ...t,
      pions: t.pions.map((p) => (p.camp === quoi.camp && p.poste === quoi.poste ? { ...p, at } : p)),
    })),
  }
}

/** Les cinq croix en miroir : chaque défenseur au milieu du segment attaquant-panier. */
function avecDefense(t: Temps, terrain: Terrain): Temps {
  const panier = PANIER[terrain][0]
  const attaque = t.pions.filter((p) => p.camp === 'attaque')
  return {
    ...t,
    pions: [...attaque, ...attaque.map((a): Pion => ({
      camp: 'defense', poste: a.poste, at: { x: (a.at.x + panier.x) / 2, y: (a.at.y + panier.y) / 2 },
    }))],
  }
}

/** Sans défense : les croix partent, leurs flèches avec elles, et le ballon revient
 *  au meneur s'il était porté par un défenseur — sinon il resterait sans porteur. */
function sansDefense(t: Temps): Temps {
  return {
    pions: t.pions.filter((p) => p.camp === 'attaque'),
    fleches: t.fleches.filter((f) => f.depuis.camp === 'attaque'),
    ballon: !('x' in t.ballon) && t.ballon.camp === 'defense' ? { camp: 'attaque', poste: 1 } : t.ballon,
  }
}

const OUTILS: { cle: Outil; libelle: string }[] = [
  { cle: 'deplacer', libelle: 'Déplacer' },
  { cle: 'course', libelle: 'Course' },
  { cle: 'ecran', libelle: 'Écran' },
  { cle: 'passe', libelle: 'Passe' },
  { cle: 'dribble', libelle: 'Dribble' },
  { cle: 'ballon', libelle: 'Ballon' },
  { cle: 'objet', libelle: 'Objets' },
  { cle: 'gomme', libelle: 'Gomme' },
]
const SORTES: { cle: ObjetPose['sorte']; libelle: string }[] = [
  { cle: 'plot', libelle: 'Plot' },
  { cle: 'ballon', libelle: 'Ballon posé' },
  { cle: 'echelle', libelle: 'Échelle' },
]

const champ: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }

export function SchemaEdit() {
  const { id } = useParams<{ id: string }>()
  const { can, guard } = useAuth()
  const [schema, setSchema] = useState<Schema | null | undefined>(undefined)
  const [tempsIndex, setTempsIndex] = useState(0)
  const [outil, setOutil] = useState<Outil>('deplacer')
  const [sorteObjet, setSorteObjet] = useState<ObjetPose['sorte']>('plot')
  // Gestes en cours : purement visuels, jamais enregistrés tels quels.
  const [prise, setPrise] = useState<{ quoi: Prise; depart: Point; at: Point } | null>(null)
  const [trace, setTrace] = useState<{ depuis: Fleche['depuis']; points: Point[] } | null>(null)
  // Une pile par temps : annuler sur le deuxième temps ne défait pas le premier.
  const [pile, setPile] = useState<Etape[][]>([])
  const [refus, setRefus] = useState('')
  const [askDefense, setAskDefense] = useState(false)
  const [nom, setNom] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!id) return
    getPlay(id).then((s) => { setSchema(s ?? null); setNom(s?.nom ?? ''); setNote(s?.note ?? '') })
  }, [id])

  if (!id) return null
  if (schema === undefined) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (schema === null) return (
    <div className="p-6">
      <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
        Schéma introuvable. <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>← Retour</Link>
      </p>
    </div>
  )

  const vivant = schema
  const index = Math.min(tempsIndex, vivant.temps.length - 1)
  const temps = vivant.temps[index]
  const hauteur = vivant.terrain === 'complet' ? D * 2 : D

  /**
   * Garder d'abord, muter ensuite : l'état local n'est touché qu'à l'intérieur de
   * l'action gardée. Muter avant laisserait, sur un code refusé, un dessin affiché
   * que la base n'a pas — c'est exactement la faute que le projet 7 a corrigée.
   */
  const modifier = (f: (s: Schema) => Schema, empiler = true) => guard('manage', () => {
    const suivant = f(vivant)
    if (empiler) setPile((p) => {
      const copie = [...p]
      const avant: Etape = { temps: structuredClone(temps), objets: structuredClone(vivant.objets) }
      copie[index] = [...(copie[index] ?? []), avant].slice(-PILE_MAX)
      return copie
    })
    setSchema(suivant)
    savePlay(suivant)
  })

  const modifierTemps = (f: (t: Temps) => Temps) =>
    modifier((s) => ({ ...s, temps: s.temps.map((t, i) => (i === index ? f(t) : t)) }))

  const annuler = () => {
    const etape = pile[index]?.at(-1)
    if (!etape) return
    guard('manage', () => {
      const suivant = { ...vivant, objets: etape.objets, temps: vivant.temps.map((t, i) => (i === index ? etape.temps : t)) }
      setPile((p) => p.map((s, i) => (i === index ? s.slice(0, -1) : s)))
      setSchema(suivant)
      savePlay(suivant)
    })
  }

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = versSvg(e, e.currentTarget)
    // Sans capture, un doigt qui sort du terrain laisserait le geste en suspens.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pas de pointeur actif (jsdom) */ }
    const pion = pionSous(temps, p)
    if (outil === 'deplacer') {
      if (pion) { setPrise({ quoi: { sorte: 'pion', camp: pion.camp, poste: pion.poste }, depart: pion.at, at: pion.at }); return }
      const i = objetSous(vivant.objets, p)
      if (i >= 0) setPrise({ quoi: { sorte: 'objet', index: i }, depart: vivant.objets[i].at, at: vivant.objets[i].at })
      return
    }
    if (outil === 'ballon') {
      modifierTemps((t) => ({ ...t, ballon: pion ? { camp: pion.camp, poste: pion.poste } : p }))
      return
    }
    if (outil === 'objet') {
      modifier((s) => ({ ...s, objets: [...s.objets, { sorte: sorteObjet, at: p }] }))
      return
    }
    if (outil === 'gomme') {
      const f = flecheSous(temps, p)
      if (f >= 0) { modifierTemps((t) => ({ ...t, fleches: t.fleches.filter((_, k) => k !== f) })); return }
      const o = objetSous(vivant.objets, p)
      if (o >= 0) modifier((s) => ({ ...s, objets: s.objets.filter((_, k) => k !== o) }))
      return
    }
    // Une flèche part toujours d'un pion : ailleurs, le geste ne trace rien.
    if (pion) setTrace({ depuis: { camp: pion.camp, poste: pion.poste }, points: [p] })
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!prise && !trace) return
    const p = versSvg(e, e.currentTarget)
    if (prise) { setPrise({ ...prise, at: p }); return }
    setTrace((t) => t && { ...t, points: [...t.points, p] })
  }

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = versSvg(e, e.currentTarget)
    if (prise) {
      const { quoi, depart } = prise
      setPrise(null)
      // Un pion reposé où il était n'est pas une modification : ni pile, ni écriture.
      if (dist(depart, p) > 0.005) modifier((s) => deplace(s, index, quoi, p))
      return
    }
    if (!trace) return
    const { depuis } = trace
    const points = reduireTrace([...trace.points, p])
    setTrace(null)
    if (!points.some((q) => dist(q, points[0]) > TRACE_MINI)) return
    modifierTemps((t) => ({ ...t, fleches: [...t.fleches, { depuis, points, trait: outil as Trait }] }))
  }

  const changerTerrain = (terrain: Terrain) => guard('manage', () => {
    const r = versTerrain(vivant, terrain)
    if ('refus' in r) { setRefus(r.refus); return }
    setRefus('')
    // Le changement de terrain remappe toutes les coordonnées : les étapes empilées
    // sont dans l'ancienne échelle et les restaurer replacerait les pions n'importe
    // où — au pire dans la moitié arrière. On vide, comme au réordonnancement.
    setPile([])
    setSchema(r.ok)
    savePlay(r.ok)
  })

  // La défense touche tous les temps à la fois : elle sort de la pile d'annulation,
  // qui est par temps. Sa protection, c'est la confirmation avant retrait.
  const changerDefense = (v: boolean) => {
    if (!v) { setAskDefense(true); return }
    modifier((s) => ({ ...s, defense: true, temps: s.temps.map((t) => avecDefense(t, s.terrain)) }), false)
  }
  const retirerDefense = () => modifier((s) => ({ ...s, defense: false, temps: s.temps.map(sansDefense) }), false)

  const ajouterTemps = () => modifier((s) => {
    setTempsIndex(s.temps.length)          // le temps ajouté devient le temps courant
    return { ...s, temps: [...s.temps, tempsSuivant(s.temps[s.temps.length - 1])] }
  }, false)

  // Réordonner ou supprimer déplace les rangs : la pile, indexée par rang, mentirait.
  // On la vide plutôt que de la faire pointer sur le mauvais temps.
  const bougerTemps = (delta: number) => {
    const j = index + delta
    if (j < 0 || j >= vivant.temps.length) return
    modifier((s) => {
      const t = [...s.temps]
      ;[t[index], t[j]] = [t[j], t[index]]
      setTempsIndex(j)
      setPile([])
      return { ...s, temps: t }
    }, false)
  }
  const supprimerTemps = () => modifier((s) => {
    setTempsIndex(Math.max(0, index - 1))
    setPile([])
    return { ...s, temps: s.temps.filter((_, i) => i !== index) }
  }, false)

  // Garder d'abord ici aussi : les champs ne s'ouvrent à la frappe qu'une fois le
  // droit acquis, sinon le nom refusé resterait affiché à la place de l'enregistré.
  const demanderCode = () => guard('manage', () => {})
  const enregistrerNom = () => { if (nom.trim() && nom !== vivant.nom) modifier((s) => ({ ...s, nom: nom.trim() }), false) }
  const enregistrerNote = () => { if ((note.trim() || undefined) !== vivant.note) modifier((s) => ({ ...s, note: note.trim() || undefined }), false) }

  const affiche = prise ? deplace(vivant, index, prise.quoi, prise.at) : vivant

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/schemas" className="text-sm font-bold" style={{ color: C.muted }}>←</Link>
        <input
          aria-label="Nom du schéma" value={nom} onChange={(e) => setNom(e.target.value)}
          onFocus={demanderCode} readOnly={!can('manage')} onBlur={enregistrerNom}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ ...champ, flex: '1 1 240px', fontWeight: 800 }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {/* La barre d'outils au-dessus du terrain, à portée de pouce. `select-none`
              partout où l'on tape : sur mobile, un appui un peu long sélectionne sinon
              le libellé du bouton au lieu de le presser. */}
          <div className="mb-3 flex select-none flex-wrap gap-2">
            {OUTILS.map((o) => (
              <button
                key={o.cle} onClick={() => setOutil(o.cle)}
                className="rounded-xl px-3 py-2 text-xs font-bold"
                style={outil === o.cle
                  ? { background: C.accent, color: '#fff' }
                  : { background: C.card, border: bd, color: C.text }}
              >
                {o.libelle}
              </button>
            ))}
            <button
              onClick={annuler} disabled={!pile[index]?.length}
              className="ml-auto rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40"
              style={{ background: C.card, border: bd, color: C.text }}
            >
              ↩ Annuler
            </button>
          </div>
          {outil === 'objet' && (
            <div className="mb-3 flex gap-2">
              {SORTES.map((s) => (
                <button
                  key={s.cle} onClick={() => setSorteObjet(s.cle)}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-bold"
                  style={sorteObjet === s.cle ? { background: C.amberBg, color: C.amber, border: `1px solid ${C.amber}` } : { background: C.card, border: bd, color: C.muted }}
                >
                  {s.libelle}
                </button>
              ))}
            </div>
          )}

          {/* Le terrain est borné par la largeur, jamais par la hauteur : c'est le
              rapport de sa boîte qui doit rester celui du viewBox, sinon le SVG se
              centre dans des marges et `versSvg` convertit de travers. La borne est
              exprimée en hauteur d'écran pour que la bande des temps reste visible
              pendant qu'on dessine — sur un écran large, le demi-terrain déborderait
              sinon sous la barre de navigation. Le terrain complet, lui, garde toute
              la largeur : le brider en hauteur le réduirait à une bande où les pions
              ne se distinguent plus, il se tient en portrait et se fait défiler.
              `select-none` : sans lui, un glisser sélectionne les numéros des pions. */}
          <div className="select-none" style={{ maxWidth: vivant.terrain === 'demi' ? '46vh' : undefined }}>
            <PlayBoard schema={affiche} tempsIndex={index} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              {/* Le geste en cours, brut : il disparaît au relâcher, remplacé par la
                  flèche réduite — ou par rien du tout si le droit a été refusé. */}
              {trace && trace.points.length > 1 && (
                <polyline
                  points={trace.points.map((p) => `${(p.x * W).toFixed(1)},${(p.y * hauteur).toFixed(1)}`).join(' ')}
                  fill="none" stroke={C.accent} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
                />
              )}
            </PlayBoard>
          </div>

          {/* La bande des temps sous le terrain : on y lit la combinaison entière. */}
          <div className="mt-3 flex select-none items-end gap-2 overflow-x-auto pb-1">
            {vivant.temps.map((_, i) => (
              <button
                key={i} aria-label={`Temps ${i + 1}`} onClick={() => setTempsIndex(i)}
                className="w-20 shrink-0 rounded-xl p-1"
                style={{ background: C.card, border: i === index ? `2px solid ${C.accent}` : bd }}
              >
                <PlayBoard schema={vivant} tempsIndex={i} apercu />
                <span className="mt-1 block text-[10px] font-bold" style={{ color: i === index ? C.accent : C.muted }}>{i + 1}</span>
              </button>
            ))}
            <button onClick={ajouterTemps} className="h-16 shrink-0 rounded-xl px-4 text-sm font-bold" style={{ background: C.card, border: bd, color: C.text }}>+ Temps</button>
          </div>
          <div className="mt-2 flex select-none gap-2">
            <button onClick={() => bougerTemps(-1)} disabled={index === 0} className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40" style={{ background: C.card, border: bd, color: C.text }}>◀ Reculer le temps</button>
            <button onClick={() => bougerTemps(1)} disabled={index === vivant.temps.length - 1} className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40" style={{ background: C.card, border: bd, color: C.text }}>Avancer le temps ▶</button>
            {/* Un schéma a toujours au moins un temps : le dernier ne se supprime pas. */}
            <button onClick={supprimerTemps} disabled={vivant.temps.length === 1} className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40" style={{ background: C.card, border: bd, color: C.pink }}>Supprimer le temps</button>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Terrain</p>
            <div className="flex gap-2">
              {(['demi', 'complet'] as Terrain[]).map((t) => (
                <button
                  key={t} onClick={() => changerTerrain(t)}
                  className="flex-1 rounded-xl py-2 text-xs font-bold"
                  style={vivant.terrain === t ? { background: C.accent, color: '#fff' } : { background: C.panel, border: bd, color: C.text }}
                >
                  {t === 'demi' ? 'Demi-terrain' : 'Terrain complet'}
                </button>
              ))}
            </div>
            {refus && <p className="mt-2 text-[11px] font-semibold" style={{ color: C.pink }}>{refus}</p>}
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={vivant.defense} onChange={(e) => changerDefense(e.target.checked)} style={{ accentColor: C.accent, width: 18, height: 18 }} />
              Défense
            </label>
          </section>

          <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
            <label htmlFor="schema-note" className="mb-1 block text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Note</label>
            <input
              id="schema-note" value={note} onChange={(e) => setNote(e.target.value)}
              onFocus={demanderCode} readOnly={!can('manage')} onBlur={enregistrerNote}
              placeholder="Consigne, variante, rappel…" style={{ ...champ, width: '100%' }}
            />
            <p className="mt-4 text-[11px]" style={{ color: C.faint }}>Ces schémas restent sur cet appareil : ils ne sont pas synchronisés avec vos autres appareils.</p>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={askDefense} danger
        title="Retirer la défense ?"
        message="Les cinq croix et les flèches qui en partent seront supprimées de tous les temps."
        confirmLabel="Retirer" onConfirm={retirerDefense} onClose={() => setAskDefense(false)}
      />
    </div>
  )
}
