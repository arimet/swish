/**
 * L'éditeur du tableau tactique. Le coach glisse ses pions, tire ses trajectoires
 * au doigt, gomme, annule, et empile les temps de sa combinaison. Chaque geste
 * abouti s'écrit en base sur-le-champ : il n'y a pas de bouton « Enregistrer »,
 * un coach au bord du terrain n'a pas une main pour ça.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  PANIER, distanceAuSegment, reduireTrace, tempsSuivant, versTerrain,
  type Camp, type Fleche, type ObjetPose, type Pion, type Point, type Poste, type Schema, type Temps, type Terrain, type Trait,
} from '../../domain/plays'
import { getPlay, savePlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { largeurTerrain, PlayBoard, versSvg } from '../components/PlayBoard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { D, W } from '../components/ShotCourt'
import { C, bd, Ic } from '../olive/kit'
import { X } from 'lucide-react'

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

/** Les cinq croix en miroir : chaque défenseur au milieu du segment attaquant-panier.
 *  Le panier retenu est le plus proche de l'attaquant — sur terrain complet, une
 *  attaque placée dans la moitié arrière (transition, presse) verrait sinon son
 *  défenseur posé dix mètres plus loin, au milieu du terrain. */
function avecDefense(t: Temps, terrain: Terrain): Temps {
  const paniers = PANIER[terrain]
  const attaque = t.pions.filter((p) => p.camp === 'attaque')
  return {
    ...t,
    pions: [...attaque, ...attaque.map((a): Pion => {
      const panier = paniers.reduce((meilleur, p) => (dist(a.at, p) < dist(a.at, meilleur) ? p : meilleur))
      return { camp: 'defense', poste: a.poste, at: { x: (a.at.x + panier.x) / 2, y: (a.at.y + panier.y) / 2 } }
    })],
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

/**
 * Les outils, par famille. Huit pastilles de texte de même poids ne disaient pas
 * qu'elles font trois choses différentes : deux façons de manipuler ce qui est
 * déjà là, quatre traits qui s'excluent, deux choses à poser. Chaque famille est
 * désormais son propre segment, et le libellé — qui reste le nom accessible du
 * bouton — cède la place à un pictogramme.
 */
const MANIPULER: { cle: Outil; libelle: string; icone: string }[] = [
  // La croix fléchée du curseur de déplacement, et la gomme du carnet.
  { cle: 'deplacer', libelle: 'outil.deplacer', icone: 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3' },
  { cle: 'gomme', libelle: 'outil.gomme', icone: 'm7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21M22 21H7M5 11l9 9' },
]
const TRACER: { cle: Trait; libelle: string }[] = [
  { cle: 'course', libelle: 'outil.course' },
  { cle: 'ecran', libelle: 'outil.ecran' },
  { cle: 'passe', libelle: 'outil.passe' },
  { cle: 'dribble', libelle: 'outil.dribble' },
]
const POSER: { cle: Outil; libelle: string }[] = [
  { cle: 'ballon', libelle: 'outil.ballon' },
  { cle: 'objet', libelle: 'outil.objets' },
]
const SORTES: { cle: ObjetPose['sorte']; libelle: string }[] = [
  { cle: 'plot', libelle: 'outil.plot' },
  { cle: 'ballon', libelle: 'outil.ballonPose' },
  { cle: 'echelle', libelle: 'outil.echelle' },
]

const champ: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }

export function SchemaEdit() {
  const trad = useT()
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
  // L'éditeur écrit de bout en bout : poser un pion, tirer une flèche, ajouter un
  // temps, tout passe par la garde. Sans le droit, il ne resterait à l'écran qu'un
  // tableau qui réclame un code à chaque geste — on renvoie donc à la consultation,
  // qui est libre et montre la même combinaison. Les gardes ci-dessous ne bougent
  // pas : ce renvoi est un confort d'affichage, pas la protection.
  if (!can('manage')) return <Navigate to={`/schemas/${id}`} replace />
  if (schema === undefined) return <div className="p-4 sm:p-6"><div className="h-96 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (schema === null) return (
    <div className="p-4 sm:p-6">
      <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
        {trad('sch.introuvable')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{trad('equipe.retour')}</Link>
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
    // Une flèche part toujours d'un pion : ailleurs, le geste ne trace rien. Et
    // elle part de sa position exacte, pas du point touché — le doigt tombe à un
    // rayon de prise près, ce qui détacherait le trait du pion, et l'animation de
    // 8B ferait démarrer le joueur à côté de lui-même.
    if (pion) setTrace({ depuis: { camp: pion.camp, poste: pion.poste }, points: [pion.at] })
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
    if ('refus' in r) { setRefus(trad('sch.refusDemi', { occupant: trad(r.refus.cle, { n: r.refus.n ?? 0 }) })); return }
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
  // Et elle vide la pile, comme le changement de terrain : une étape empilée porte
  // dix pions quand le schéma vient de repasser à cinq. La restaurer écrirait un
  // schéma sans défense mais avec ses croix — l'invariante « cinq ou dix pions
  // selon `defense` » cassée, et écrite en base.
  const changerDefense = (v: boolean) => {
    if (!v) { setAskDefense(true); return }
    modifier((s) => { setPile([]); return { ...s, defense: true, temps: s.temps.map((t) => avecDefense(t, s.terrain)) } }, false)
  }
  const retirerDefense = () => modifier((s) => { setPile([]); return { ...s, defense: false, temps: s.temps.map(sansDefense) } }, false)

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

  // Les champs n'ont plus à réclamer un code à la frappe : on n'entre dans
  // l'éditeur qu'avec le droit (cf. le renvoi ci-dessus). L'enregistrement reste
  // gardé — `modifier` est la seule porte vers la base.
  const enregistrerNom = () => { if (nom.trim() && nom !== vivant.nom) modifier((s) => ({ ...s, nom: nom.trim() }), false) }
  const enregistrerNote = () => { if ((note.trim() || undefined) !== vivant.note) modifier((s) => ({ ...s, note: note.trim() || undefined }), false) }

  const affiche = prise ? deplace(vivant, index, prise.quoi, prise.at) : vivant

  // La bande des temps se cale sur le terrain — elle en montre les états — mais ne
  // descend pas sous une largeur utilisable : un terrain complet ne fait que 26vh
  // de large, et l'en-tête s'y replierait sur deux lignes pendant que les vignettes
  // se couperaient. Le `min(100%, …)` garde la promesse de ne jamais déborder.
  const largeurBande = `min(100%, max(320px, ${largeurTerrain(vivant.terrain, 'edition')}))`

  // Seul écran du dépôt à respirer moins large sur téléphone (`p-4` au lieu de
  // `p-6`) : les seize pixels rendus au terrain sont seize pixels de plus pour
  // viser un pion au pouce, et c'est ici qu'on vise.
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/schemas" aria-label={trad('edit.retourSchemas')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold" style={{ border: bd, color: C.muted }}>←</Link>
        <input
          aria-label={trad('edit.nomSchema')} value={nom} onChange={(e) => setNom(e.target.value)}
          onBlur={enregistrerNom}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ ...champ, flex: '1 1 180px', minWidth: 0, fontWeight: 800 }}
        />
        {/* Voir ce qu'on vient de dessiner se joue : le lecteur est à un doigt de
            l'éditeur, teinté d'accent comme partout ailleurs — c'est le même geste
            sur les quatre écrans. */}
        <Link
          to={`/schemas/${id}/lecteur`}
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold"
          style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBd}` }}
        >
          {trad('sch.jouer')}
        </Link>
      </div>

      {/* `[&>*]:min-w-0` : sans lui, une rangée de commandes non sécable impose sa
          largeur intrinsèque à la colonne de la grille, qui déborde alors de
          l'écran — et emmène le terrain avec elle. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <div>
          {/* La barre d'outils au-dessus du terrain, à portée de pouce. `select-none`
              partout où l'on tape : sur mobile, un appui un peu long sélectionne sinon
              le libellé du bouton au lieu de le presser. */}
          <div className="mb-3 flex select-none flex-wrap items-center gap-2">
            <Famille titre={trad('edit.manipuler')}>
              {MANIPULER.map((o) => (
                <OutilBouton key={o.cle} libelle={trad(o.libelle)} actif={outil === o.cle} onClick={() => setOutil(o.cle)}>
                  <Ic d={o.icone} className="h-[19px] w-[19px]" />
                </OutilBouton>
              ))}
            </Famille>
            <Famille titre={trad('edit.tracer')}>
              {TRACER.map((t) => (
                <OutilBouton key={t.cle} libelle={trad(t.libelle)} actif={outil === t.cle} onClick={() => setOutil(t.cle)}>
                  <TraitDessine trait={t.cle} />
                </OutilBouton>
              ))}
            </Famille>
            <Famille titre={trad('edit.poser')}>
              {POSER.map((o) => (
                <OutilBouton key={o.cle} libelle={trad(o.libelle)} actif={outil === o.cle} onClick={() => setOutil(o.cle)}>
                  <PoserDessine quoi={o.cle} actif={outil === o.cle} />
                </OutilBouton>
              ))}
            </Famille>
            {/* Nom accessible explicite : « Annuler » tout court se confond avec le
                bouton d'abandon des dialogues de confirmation. */}
            <button
              onClick={annuler} disabled={!pile[index]?.length} aria-label={trad('edit.annulerDerniere')}
              className="ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-40"
              style={{ background: C.card, border: bd, color: C.text }}
            >
              <span className="text-base leading-none">↩</span> {trad('commun.annuler')}
            </button>
          </div>
          {outil === 'objet' && (
            <div className="mb-3 flex select-none flex-wrap gap-2">
              {SORTES.map((s) => (
                <button
                  key={s.cle} onClick={() => setSorteObjet(s.cle)} aria-pressed={sorteObjet === s.cle}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-bold"
                  style={sorteObjet === s.cle ? { background: C.amberBg, color: C.amber, border: `1px solid ${C.amber}` } : { background: C.card, border: bd, color: C.muted }}
                >
                  {trad(s.libelle)}
                </button>
              ))}
            </div>
          )}

          {/* Le terrain est borné par la largeur, jamais par la hauteur : c'est le
              rapport de sa boîte qui doit rester celui du viewBox, sinon le SVG se
              centre dans des marges et `versSvg` convertit de travers. La borne dit
              trois choses à la fois (largeur disponible, hauteur d'écran, plafond) ;
              c'est `largeurTerrain` qui les tient.
              `select-none` : sans lui, un glisser sélectionne les numéros des pions. */}
          <div className="select-none" style={{ maxWidth: largeurTerrain(vivant.terrain, 'edition') }}>
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

          {/* Réordonner et supprimer un temps sont des gestes rares : ils n'ont pas à
              tenir un rang pleine largeur sous la bande, là où la barre de navigation
              du téléphone les rattrapait. Ils tiennent maintenant dans l'en-tête de
              la bande, contre le numéro du temps qu'ils manipulent — et la bande
              entière se cale sur la largeur du terrain, dont elle montre les états. */}
          <div className="mt-4 flex select-none items-center gap-2" style={{ maxWidth: largeurBande }}>
            <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.faint }}>
              {trad('sch.temps', { n: index + 1, total: vivant.temps.length })}
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              <CommandeTemps libelle={trad('edit.reculerTemps')} onClick={() => bougerTemps(-1)} disabled={index === 0}>◀</CommandeTemps>
              <CommandeTemps libelle={trad('edit.avancerTemps')} onClick={() => bougerTemps(1)} disabled={index === vivant.temps.length - 1}>▶</CommandeTemps>
              {/* Un schéma a toujours au moins un temps : le dernier ne se supprime pas. */}
              <CommandeTemps libelle={trad('edit.supprimerTemps')} onClick={supprimerTemps} disabled={vivant.temps.length === 1} danger><X className="h-4 w-4" strokeWidth={2.5} /></CommandeTemps>
            </div>
          </div>

          {/* La bande des temps sous le terrain : on y lit la combinaison entière. */}
          <div className="mt-2 flex select-none items-stretch gap-2 overflow-x-auto pb-1" style={{ maxWidth: largeurBande }}>
            {vivant.temps.map((_, i) => (
              <button
                key={i} aria-label={trad('edit.tempsN', { n: i + 1 })} aria-pressed={i === index} onClick={() => setTempsIndex(i)}
                className="w-20 shrink-0 rounded-xl p-1"
                style={{ background: C.card, border: i === index ? `2px solid ${C.accent}` : bd }}
              >
                <PlayBoard schema={vivant} tempsIndex={i} apercu />
                <span className="mt-1 block text-[12px] font-bold" style={{ color: i === index ? C.accent : C.muted }}>{i + 1}</span>
              </button>
            ))}
            <button
              onClick={ajouterTemps} aria-label={trad('edit.ajouterTemps')}
              className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-bold"
              style={{ background: C.card, border: `1px dashed ${C.border}`, color: C.muted }}
            >
              <span className="text-lg leading-none" style={{ color: C.accent }}>+</span>
              {trad('edit.temps')}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{trad('edit.terrain')}</p>
            <div className="flex gap-2">
              {(['demi', 'complet'] as Terrain[]).map((t) => (
                <button
                  key={t} onClick={() => changerTerrain(t)} aria-pressed={vivant.terrain === t}
                  className="min-w-0 flex-1 rounded-xl py-2 text-xs font-bold"
                  style={vivant.terrain === t ? { background: C.brand, color: C.onBrand } : { background: C.panel, border: bd, color: C.text }}
                >
                  {trad(t === 'demi' ? 'sch.demiTerrain' : 'sch.terrainComplet')}
                </button>
              ))}
            </div>
            {refus && <p className="mt-2 text-[12px] font-semibold" style={{ color: C.accent }}>{refus}</p>}
            {/* `-mx-2 px-2 py-2.5` : c'est le libellé qu'on touche, pas la case, et il
                faisait vingt pixels de haut — pour une bascule qui redessine le schéma
                entier et demande confirmation. La marge négative garde l'alignement
                visuel du texte sur le reste de la carte. */}
            <label className="-mx-2 mt-3 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-semibold">
              <input type="checkbox" checked={vivant.defense} onChange={(e) => changerDefense(e.target.checked)} />
              {trad('edit.defense')}
            </label>
          </section>

          <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
            <label htmlFor="schema-note" className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{trad('edit.note')}</label>
            <input
              id="schema-note" value={note} onChange={(e) => setNote(e.target.value)}
              onBlur={enregistrerNote}
              placeholder={trad('edit.notePlaceholder')} style={{ ...champ, width: '100%' }}
            />
            <p className="mt-4 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{trad('sch.schemasLocaux')}</p>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={askDefense} danger
        title={trad('edit.retirerDefenseTitre')}
        message={trad('edit.retirerDefenseTexte')}
        confirmLabel={trad('commun.retirer')} onConfirm={retirerDefense} onClose={() => setAskDefense(false)}
      />
    </div>
  )
}

/** Une famille d'outils : son propre segment, son propre fond. C'est la forme qui
 *  dit « ceci ne fait pas la même chose que cela » — le titre reste pour les
 *  lecteurs d'écran, et s'affiche dès qu'il y a la place. */
function Famille({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={titre} className="flex shrink-0 items-center gap-1 rounded-2xl p-1" style={{ background: C.panel, border: bd }}>
      <span className="hidden pl-1.5 pr-0.5 text-[12px] font-black uppercase tracking-wider xl:inline" style={{ color: C.faint }}>{titre}</span>
      {children}
    </div>
  )
}

/** Un outil. Le pictogramme porte le sens, l'`aria-label` porte le nom : le bouton
 *  reste « Course » pour un lecteur d'écran comme pour un test, sans que le mot
 *  vole la place au dessin. */
function OutilBouton({ libelle, actif, onClick, children }: { libelle: string; actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick} aria-label={libelle} title={libelle} aria-pressed={actif}
      className="grid h-10 min-w-10 place-items-center rounded-xl px-1.5 transition"
      style={actif ? { background: C.brand, color: C.onBrand } : { background: 'transparent', color: C.muted }}
    >
      {children}
    </button>
  )
}

/** Ce que le bouton pose, dessiné comme le tableau le dessine : le ballon est le
 *  disque ambre qu'on voit sur le terrain, le plot son triangle ambre. Un contour
 *  générique se lisait « globe » ; ici le bouton montre littéralement son effet. */
function PoserDessine({ quoi, actif }: { quoi: Outil; actif: boolean }) {
  const teinte = actif ? C.onBrand : C.amber
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]">
      {quoi === 'ballon'
        ? <circle cx={12} cy={12} r={7} fill={teinte} />
        : <path d="M12 4.5 20 19.5H4z" fill={teinte} />}
    </svg>
  )
}

/** Le trait tel que le tableau le dessine : plein et fléché pour la course, barré
 *  en T pour l'écran, pointillé pour la passe, ondulé pour le dribble. C'est la
 *  convention du carnet de coach, la même que `PlayBoard` — un mot met trois
 *  secondes à dire ce que ce tracé dit d'un coup d'œil. */
function TraitDessine({ trait }: { trait: Trait }) {
  return (
    <svg viewBox="0 0 34 22" className="h-[22px] w-[34px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path
        d={trait === 'dribble' ? 'M3 15q2.5-6 5 0t5 0t5 0t5 0' : `M3 15h${trait === 'ecran' ? 24 : 20}`}
        strokeDasharray={trait === 'passe' ? '4.5 3.5' : undefined}
      />
      <path d={trait === 'ecran' ? 'M27 8v14' : 'm22 10 5 5-5 5'} />
    </svg>
  )
}

/** Une commande de la bande des temps : carrée, au pouce, et le danger seul en
 *  rose bordé — le reste du dépôt ne fait pas autrement. */
function CommandeTemps({ libelle, onClick, disabled, danger, children }: {
  libelle: string; onClick: () => void; disabled: boolean; danger?: boolean; children: ReactNode
}) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={libelle} title={libelle}
      className="grid h-10 w-10 place-items-center rounded-xl text-xs font-black disabled:opacity-30"
      style={danger ? { border: `1px solid ${C.accentBd}`, color: C.accent } : { background: C.card, border: bd, color: C.text }}
    >
      {children}
    </button>
  )
}
