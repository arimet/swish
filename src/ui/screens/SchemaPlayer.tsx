/**
 * Le lecteur du temps-mort : la combinaison se joue, hors de la coquille, sur le
 * téléphone que cinq joueurs regardent à bout de bras. Tout est taillé pour ce
 * moment-là — le terrain occupe l'écran, on avance d'un temps en touchant une
 * moitié d'écran, et la sortie reste visible. La lecture n'est jamais protégée.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { instantane, transitions } from '../../domain/anim'
import type { Schema } from '../../domain/plays'
import { getPlay } from '../../persistence/repositories'
import { ExportSchema } from '../components/ExportSchema'
import { largeurTerrain, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'
import { useT } from '../../i18n'
import { Pause, Play, X } from 'lucide-react'

/** Une transition dure une seconde et demie, le double au ralenti. Ce n'est pas
 *  réglable : 1,5 s laisse lire un mouvement sans qu'on s'impatiente. */
const DUREE = 1500

/** Le pas de la boucle. Trente images par seconde suffisent à un pion qui
 *  glisse, et un minuteur se pilote depuis un test — ce que
 *  `requestAnimationFrame` ne fait pas. */
const PAS = 50

/** Le système demande-t-il moins de mouvement ? On le lit au démarrage de la
 *  lecture ; ce n'est pas un confort, c'est la seule façon correcte de traiter
 *  quelqu'un que le mouvement dérange. */
const moinsDeMouvement = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function SchemaPlayer() {
  const trad = useT()
  const { id } = useParams<{ id: string }>()
  const [schema, setSchema] = useState<Schema | null | undefined>(undefined)
  // L'avancement, en temps décimaux : 1,5 est à mi-chemin du deuxième au
  // troisième temps. Un seul nombre pour la barre, les zones et l'animation.
  const [pos, setPos] = useState(0)
  const [enLecture, setEnLecture] = useState(false)
  const [boucle, setBoucle] = useState(false)
  const [ralenti, setRalenti] = useState(false)
  // Les trajets pendant la lecture. Éteint par défaut : sans eux, l'animation
  // nue, qui est ce que le lecteur a toujours montré. Rien n'est mémorisé d'une
  // ouverture à l'autre, comme la boucle et le ralenti — un réglage sur trois qui
  // se souviendrait serait le plus déroutant des trois.
  const [trajets, setTrajets] = useState(false)
  const [partage, setPartage] = useState(false)

  useEffect(() => { if (id) getPlay(id).then((s) => setSchema(s ?? null)) }, [id])

  const dernier = schema ? transitions(schema) : 0

  useEffect(() => {
    if (!enLecture) return
    const duree = ralenti ? DUREE * 2 : DUREE
    const saute = moinsDeMouvement()
    const pas = saute ? duree : PAS
    const iv = window.setInterval(() => setPos((p) => {
      const suivant = saute ? Math.floor(p) + 1 : p + pas / duree
      if (suivant < dernier) return suivant
      // On se pose exactement sur le dernier temps avant de reboucler : sinon on
      // ne le voit jamais.
      if (p < dernier) return dernier
      return boucle ? 0 : dernier
    }), pas)
    return () => clearInterval(iv)
  }, [enLecture, ralenti, boucle, dernier])

  // Arrivé au bout sans boucle, la lecture s'arrête d'elle-même.
  useEffect(() => { if (enLecture && !boucle && pos >= dernier) setEnLecture(false) }, [enLecture, boucle, pos, dernier])

  // Onglet en arrière-plan : on coupe. Une animation qui continue vide la
  // batterie et se retrouve à un endroit imprévu au retour.
  useEffect(() => {
    const cacher = () => { if (document.hidden) setEnLecture(false) }
    document.addEventListener('visibilitychange', cacher)
    return () => document.removeEventListener('visibilitychange', cacher)
  }, [])

  if (!id) return null
  if (schema === undefined) return <Ecran><p style={{ color: C.muted }}>{trad('commun.chargement')}</p></Ecran>
  if (schema === null) return (
    <Ecran>
      <p style={{ color: C.muted }}>
        {trad('sch.introuvable')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{trad('equipe.retour')}</Link>
      </p>
    </Ecran>
  )

  const courant = Math.round(pos)
  /**
   * Le temps voisin **dans le sens du geste**, pas le voisin de l'arrondi. Depuis
   * une position fractionnaire — pause en pleine transition, barre lâchée hors
   * d'un cran — `Math.round` a déjà « pré-avancé » d'un demi-pas, et ajouter 1
   * sauterait un temps entier. Un coach qui met en pause pour commenter puis tape
   * « suivant » ne doit pas voir la combinaison enjamber une étape.
   */
  const aller = (delta: number) => {
    setEnLecture(false)
    const vise = delta > 0 ? Math.floor(pos) + 1 : Math.ceil(pos) - 1
    setPos(Math.min(dernier, Math.max(0, vise)))
  }
  const jouer = () => {
    // Relancer depuis le bout, c'est rejouer : sinon le bouton ne ferait rien.
    if (pos >= dernier) setPos(0)
    setEnLecture(true)
  }

  // Arrêté sur un temps entier, on remontre le temps tel qu'il est dessiné,
  // flèches comprises : l'animation les remplace le temps qu'elle joue, mais à
  // la pause c'est le carnet qu'on relit — et le dernier temps ne dit son
  // intention que par ses traits, puisqu'aucun temps ne le suit.
  // Arrêté **entre** deux temps, en revanche, on ne les remontre pas : elles
  // partent des positions dessinées, pas de celles où les pions se trouvent à cet
  // instant, et le décalage se lirait comme une erreur. Un arrêt à mi-geste montre
  // où les joueurs en sont ; c'est déjà ce qu'on est venu voir.
  // Arrêté **entre** deux temps, on ne remontrait pas non plus les flèches, faute
  // de pouvoir les ancrer. La bascule lève cette réserve : le trajet qu'elle trace
  // est recalé sur les positions réelles, donc il se lit à mi-geste aussi.
  const temps = !enLecture && Number.isInteger(pos)
    ? schema.temps[pos]
    : instantane(schema, { temps: Math.floor(pos), part: pos - Math.floor(pos) }, trajets)
  // Le lecteur prend la place disponible, mais pas plus que `TERRAIN_MAX` : sur un
  // téléphone tenu à bout de bras chaque centimètre compte, sur un écran de bureau
  // un terrain de mille pixels ne se lit pas mieux, il se lit moins bien. Le SVG se
  // cale lui-même dans sa boîte (`preserveAspectRatio`), sans distorsion, et rien
  // ici ne convertit de coordonnées — on lit, on ne dessine pas.
  const large = largeurTerrain(schema.terrain)

  return (
    <Ecran>
      <div className="flex min-h-dvh flex-col gap-2 p-3">
        {/* L'en-tête ne dispute pas la place au terrain : la sortie est un carré à
            gauche, là où le pouce la cherche, le nom prend tout le reste, et
            « Partager » reste en contour — le seul bouton plein du lecteur est
            « Lecture », en bas. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={`/schemas/${id}`} aria-label={trad('sch.quitterLecteur')} title={trad('sch.quitterLecteur')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-black" style={{ border: bd, color: C.muted }}
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight">{schema.nom}</h1>
          {/* La lecture s'arrête pendant le partage : on ne fabrique pas une image
              du temps qu'on est en train de quitter. */}
          <button
            onClick={() => { setEnLecture(false); setPartage(true) }}
            className="h-10 shrink-0 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}
          >
            {trad('sch.partager')}
          </button>
        </div>
        <ExportSchema schema={schema} tempsIndex={courant} open={partage} onClose={() => setPartage(false)} />

        {/* Le terrain, et par-dessus les deux moitiés d'écran : au temps-mort on
            ne vise pas un bouton de quarante pixels. Elles s'arrêtent au-dessus
            des commandes, qui restent atteignables. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="h-full w-full select-none" style={{ maxWidth: large }}>
            <PlayBoard schema={schema} tempsIndex={0} temps={temps} remplit />
          </div>
          <Zone cote="left" label="Temps précédent" fleche="‹" onClick={() => aller(-1)} disabled={courant === 0} />
          <Zone cote="right" label="Temps suivant" fleche="›" onClick={() => aller(1)} disabled={courant === dernier} />
        </div>

        <div className="mx-auto flex w-full shrink-0 flex-col gap-2" style={{ maxWidth: large }}>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-extrabold">{trad('sch.temps', { n: courant + 1, total: schema.temps.length })}</span>
            <input
              type="range" aria-label={trad('sch.avancement')} min={0} max={dernier || 1} step={0.01} value={pos}
              disabled={dernier === 0}
              onChange={(e) => { setEnLecture(false); setPos(Number(e.target.value)) }}
              className="piste min-w-0 flex-1 cursor-pointer appearance-none disabled:opacity-40"
            />
          </div>
          {/* Deux rangées, et non plus une. À trois réglages, la rangée unique
              débordait de sept pixels et c'est « Lecture » qui payait : en `flex-1`
              il se laissait comprimer jusqu'à quatre-vingt-sept pixels, son libellé
              rogné, alors que c'est la seule commande qu'on vise en plein
              temps-mort. L'action prend donc toute la largeur, les réglages se
              partagent la suivante à parts égales — et un quatrième réglage, un
              jour, ne cassera rien. */}
          <button
            onClick={() => (enLecture ? setEnLecture(false) : jouer())} disabled={dernier === 0}
            aria-label={enLecture ? 'Pause' : 'Lecture'}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-black text-[var(--c-on-brand)] disabled:opacity-40"
            style={{ background: C.brand }}
          >
            {enLecture
              ? <><Pause className="h-4 w-4 shrink-0" strokeWidth={2.5} />{trad('sch.pause')}</>
              : <><Play className="h-4 w-4 shrink-0" strokeWidth={2.5} />{trad('sch.lecture')}</>}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <Bascule label={trad('sch.trajets')} actif={trajets} onClick={() => setTrajets((t) => !t)} />
            <Bascule label={trad('sch.boucle')} actif={boucle} onClick={() => setBoucle((b) => !b)} />
            <Bascule label={trad('sch.ralenti')} actif={ralenti} onClick={() => setRalenti((r) => !r)} />
          </div>
        </div>
      </div>
    </Ecran>
  )
}

/** Le fond du lecteur : le cadre de l'application, plein écran. Le terrain, lui,
 *  reste sombre — c'est le tableau du coach, pas une carte de plus. */
function Ecran({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

/** Une moitié d'écran qui avance ou recule d'un temps. Éteinte à l'extrémité :
 *  le défilement se borne, il ne boucle pas.
 *
 *  Le chevron est de l'encre voilée : à 35 % il ne donnait plus que 2,4:1 sur le
 *  fond clair, sous le seuil même pour un glyphe de cette taille. 45 % le
 *  remonte à 3,3:1 sans le rendre bavard. */
function Zone({ cote, label, fleche, onClick, disabled }: {
  cote: 'left' | 'right'; label: string; fleche: string; onClick: () => void; disabled: boolean
}) {
  return (
    <button
      aria-label={label} onClick={onClick} disabled={disabled}
      className={`absolute inset-y-0 ${cote === 'left' ? 'left-0' : 'right-0'} w-1/2 px-2 text-4xl font-black disabled:opacity-0`}
      style={{ color: C.text, opacity: 0.45, textAlign: cote }}
    >
      {fleche}
    </button>
  )
}

/** Trajets, boucle et ralenti : les trois réglages qu'un coach utilise réellement.
 *  Plus de `shrink-0` : dans une grille à colonnes égales, chacune tient déjà sa
 *  largeur, et l'interdiction de rétrécir n'y servait qu'à déborder. */
function Bascule({ label, actif, onClick }: { label: string; actif: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-pressed={actif}
      className="rounded-2xl px-2 py-4 text-sm font-bold"
      style={{ border: bd, background: actif ? C.accentBg : C.card, color: actif ? C.accent : C.muted }}
    >
      {label}
    </button>
  )
}
