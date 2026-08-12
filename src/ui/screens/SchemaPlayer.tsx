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
import { PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

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
  const { id } = useParams<{ id: string }>()
  const [schema, setSchema] = useState<Schema | null | undefined>(undefined)
  // L'avancement, en temps décimaux : 1,5 est à mi-chemin du deuxième au
  // troisième temps. Un seul nombre pour la barre, les zones et l'animation.
  const [pos, setPos] = useState(0)
  const [enLecture, setEnLecture] = useState(false)
  const [boucle, setBoucle] = useState(false)
  const [ralenti, setRalenti] = useState(false)
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
  if (schema === undefined) return <Ecran><p style={{ color: C.muted }}>Chargement…</p></Ecran>
  if (schema === null) return (
    <Ecran>
      <p style={{ color: C.muted }}>
        Schéma introuvable. <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>← Retour</Link>
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
  const temps = !enLecture && Number.isInteger(pos)
    ? schema.temps[pos]
    : instantane(schema, { temps: Math.floor(pos), part: pos - Math.floor(pos) })
  // Le lecteur remplit toute la place disponible : le SVG se cale lui-même dans sa
  // boîte (`preserveAspectRatio`), sans distorsion. L'éditeur ne peut pas faire ça —
  // il borne la largeur pour que la boîte du SVG garde le rapport du viewBox, sans
  // quoi la conversion du doigt en coordonnées viserait de travers. Ici rien ne
  // convertit : on lit, on ne dessine pas. C'est l'écran du temps-mort, cinq joueurs
  // penchés dessus — chaque centimètre gagné se voit.
  const large = schema.terrain === 'demi' ? '46vh' : undefined

  return (
    <Ecran>
      <div className="flex min-h-dvh flex-col gap-2 p-3">
        <div className="flex shrink-0 items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight" style={{ color: C.muted }}>{schema.nom}</h1>
          {/* La lecture s'arrête pendant le partage : on ne fabrique pas une image
              du temps qu'on est en train de quitter. */}
          <button
            onClick={() => { setEnLecture(false); setPartage(true) }}
            className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: bd, color: C.text }}
          >
            Partager
          </button>
          <Link to={`/schemas/${id}`} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: bd, color: C.text }}>
            Quitter ✕
          </Link>
        </div>
        <ExportSchema schema={schema} tempsIndex={courant} open={partage} onClose={() => setPartage(false)} />

        {/* Le terrain, et par-dessus les deux moitiés d'écran : au temps-mort on
            ne vise pas un bouton de quarante pixels. Elles s'arrêtent au-dessus
            des commandes, qui restent atteignables. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="h-full w-full select-none">
            <PlayBoard schema={schema} tempsIndex={0} temps={temps} remplit />
          </div>
          <Zone cote="left" label="Temps précédent" fleche="‹" onClick={() => aller(-1)} disabled={courant === 0} />
          <Zone cote="right" label="Temps suivant" fleche="›" onClick={() => aller(1)} disabled={courant === dernier} />
        </div>

        <div className="mx-auto flex w-full shrink-0 flex-col gap-2" style={{ maxWidth: large }}>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-extrabold">Temps {courant + 1} / {schema.temps.length}</span>
            <input
              type="range" aria-label="Avancement" min={0} max={dernier || 1} step={0.01} value={pos}
              disabled={dernier === 0}
              onChange={(e) => { setEnLecture(false); setPos(Number(e.target.value)) }}
              className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full disabled:opacity-40"
              style={{ background: C.card2, accentColor: C.accent }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => (enLecture ? setEnLecture(false) : jouer())} disabled={dernier === 0}
              aria-label={enLecture ? 'Pause' : 'Lecture'}
              className="flex-1 rounded-2xl py-4 text-base font-black text-white disabled:opacity-40"
              style={{ background: C.accent }}
            >
              {enLecture ? '❚❚ Pause' : '▶ Lecture'}
            </button>
            <Bascule label="Boucle" actif={boucle} onClick={() => setBoucle((b) => !b)} />
            <Bascule label="Ralenti" actif={ralenti} onClick={() => setRalenti((r) => !r)} />
          </div>
        </div>
      </div>
    </Ecran>
  )
}

/** Le fond du lecteur : sombre et plein, comme le suivi spectateur. */
function Ecran({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

/** Une moitié d'écran qui avance ou recule d'un temps. Éteinte à l'extrémité :
 *  le défilement se borne, il ne boucle pas. */
function Zone({ cote, label, fleche, onClick, disabled }: {
  cote: 'left' | 'right'; label: string; fleche: string; onClick: () => void; disabled: boolean
}) {
  return (
    <button
      aria-label={label} onClick={onClick} disabled={disabled}
      className={`absolute inset-y-0 ${cote === 'left' ? 'left-0' : 'right-0'} w-1/2 px-2 text-4xl font-black disabled:opacity-0`}
      style={{ color: C.text, opacity: 0.35, textAlign: cote }}
    >
      {fleche}
    </button>
  )
}

/** Boucle et ralenti : les deux seuls réglages qu'un coach utilise réellement. */
function Bascule({ label, actif, onClick }: { label: string; actif: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-pressed={actif}
      className="shrink-0 rounded-2xl px-4 py-4 text-sm font-bold"
      style={{ border: bd, background: actif ? C.accentBg : C.card, color: actif ? C.accent : C.muted }}
    >
      {label}
    </button>
  )
}
