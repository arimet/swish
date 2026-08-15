/**
 * Faire sortir une combinaison de l'application : un lien qui la porte entière,
 * une image, un PDF, un GIF animé.
 *
 * Le lien vient en premier : c'est le seul qui garde l'animation, et il ne
 * demande rien à personne — le schéma voyage dans le fragment, il n'y a ni
 * serveur, ni compte, ni synchronisation. C'est aussi ce qui le rend long, et
 * l'écran le dit plutôt que de laisser croire à un dysfonctionnement.
 *
 * Les trois sorties fichier partent du même geste : le tableau rendu en SVG,
 * rasterisé dans un canvas sur fond opaque. Aucune dépendance — le PDF et le
 * GIF sont écrits octet à octet plus bas, ce qui coûte deux cents lignes contre
 * plusieurs centaines de kilooctets de bibliothèque.
 *
 * Partager et exporter sont **libres** : rien n'est modifié, aucun code n'est
 * demandé, quel que soit le rôle.
 */
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { instantane, transitions } from '../../domain/anim'
import { LIMITE_LIEN, encoder } from '../../domain/partage'
import type { Schema, Temps } from '../../domain/plays'
import { C, bd } from '../olive/kit'
import { useT } from '../../i18n'
import { PlayBoard } from './PlayBoard'
import { D, W } from './ShotCourt'
import { Link2 } from 'lucide-react'

/** Profondeur du viewBox : le terrain complet, c'est le demi et son miroir. */
const profondeur = (s: Schema) => (s.terrain === 'complet' ? D * 2 : D)

/** Le nom du fichier, débarrassé de ce qu'un système de fichiers n'aime pas. */
const nomFichier = (s: Schema, ext: string) =>
  `${(s.nom || 'schéma').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'schema'}.${ext}`

/** Le moteur de rendu hors écran n'arrive qu'au premier partage : deux cents
 *  kilooctets qu'un coach n'a pas à télécharger pour ouvrir une feuille de match.
 *  Le service worker le met en cache comme le reste du bundle, donc partager
 *  fonctionne aussi hors ligne. */
const rendu = async () => (await import('react-dom/server')).renderToStaticMarkup

/**
 * Le tableau en SVG autonome. Le nœud affiché ne suffit pas : le PDF veut un
 * temps par page et le GIF une image tous les dixièmes de seconde, donc on rend
 * le composant à la demande plutôt que de sérialiser ce qui est à l'écran.
 *
 * `width`/`height` sont ajoutés parce qu'un `Image` refuse de rasteriser un SVG
 * qui n'a que son `viewBox`, et les guillemets typographiques des identifiants
 * de React sont écartés : ce SVG-là est relu par un analyseur XML strict.
 */
async function svgAutonome(schema: Schema, temps: Temps, largeur: number, hauteur: number): Promise<string> {
  const enMarkup = await rendu()
  return enMarkup(<PlayBoard schema={schema} tempsIndex={0} temps={temps} apercu />)
    .replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}"`)
    .replace(/[«»]/g, '_')
}

/** Le SVG dessiné dans un canvas, **sur fond opaque** : un PNG transparent posé
 *  sur une messagerie sombre devient illisible. */
async function rasteriser(svg: string, largeur: number, hauteur: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok()
      img.onerror = () => ko(new Error('le tableau n’a pas pu être rasterisé'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas indisponible')
    ctx.fillStyle = C.frame
    ctx.fillRect(0, 0, largeur, hauteur)
    ctx.drawImage(img, 0, 0, largeur, hauteur)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

const enBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('image vide'))), type, q))

/** Le temps rendu à deux fois son viewBox — 3000 × 2800 pour un demi-terrain,
 *  soit une image qui tient sur le mur d'un vestiaire. */
async function fabriquerPng(schema: Schema, temps: Temps): Promise<Blob> {
  const h = profondeur(schema)
  const canvas = await rasteriser(await svgAutonome(schema, temps, W * 2, h * 2), W * 2, h * 2)
  return enBlob(canvas, 'image/png')
}

// ─────────────────────────────── Le PDF ───────────────────────────────

const octetsDe = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

/** Ce que le dépôt écrit et que latin-1 ne sait pas coder : la ponctuation
 *  typographique — tirets cadratins, apostrophes courbes — et l'`œ`, seule lettre
 *  française au-dessus de latin-1. Tout cela existe dans `WinAnsiEncoding`. Sans
 *  cette table, un titre s'imprimerait « Pick and roll ? temps 1 / 4 » et une
 *  « combinaison cœur » deviendrait « c?ur ».
 *  Les guillemets français n'y sont pas : `«` et `»` tombent déjà sur les bons
 *  codes par latin-1. */
const WINANSI: Record<string, number> = {
  '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  'Œ': 0x8c, 'œ': 0x9c, 'Š': 0x8a, 'š': 0x9a, 'Ÿ': 0x9f, '€': 0x80,
}

/** Une chaîne littérale PDF. Ce qui n'a pas de place dans `WinAnsiEncoding` — un
 *  emoji dans un nom de schéma — devient un point d'interrogation plutôt que de
 *  décaler tout l'octet-à-octet. */
const litteral = (s: string) =>
  `(${[...s].map((c) => {
    if ('()\\'.includes(c)) return '\\' + c
    if (WINANSI[c]) return String.fromCharCode(WINANSI[c])
    return c.charCodeAt(0) > 255 ? '?' : c
  }).join('')})`

/**
 * Un PDF écrit à la main : en-tête, un objet par page, une image JPEG embarquée
 * telle quelle (`DCTDecode` prend les octets du canvas sans les retoucher), une
 * table de références croisées. C'est un format simple dès qu'on se limite à des
 * images et à une police de base — et cela évite une dépendance entière.
 */
function assemblerPdf(pages: { jpeg: Uint8Array; l: number; h: number; titre: string; sous: string }[]): Blob {
  const A4 = { l: 595, h: 842 }
  const marge = 40
  const morceaux: Uint8Array[] = []
  let taille = 0
  const ecrire = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? octetsDe(x) : x
    morceaux.push(b)
    taille += b.length
  }
  const offsets: number[] = []
  const objet = (num: number, corps: string, flux?: Uint8Array) => {
    offsets[num] = taille
    ecrire(`${num} 0 obj\n${corps}\n`)
    if (flux) {
      ecrire('stream\n')
      ecrire(flux)
      ecrire('\nendstream\n')
    }
    ecrire('endobj\n')
  }

  // Le commentaire binaire de la deuxième ligne : il annonce aux outils que le
  // fichier n'est pas du texte, et sans lui certains le transmettent de travers.
  ecrire('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  const numPage = (i: number) => 4 + 3 * i
  objet(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objet(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${numPage(i)} 0 R`).join(' ')}] >>`)
  objet(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

  pages.forEach((p, i) => {
    const n = numPage(i)
    // L'image occupe ce qui reste sous le titre, sans jamais être déformée, et
    // reste centrée dans cette place : un demi-terrain plaqué en bas de page
    // laisserait une bande blanche là où l'œil cherche le dessin.
    const dispo = { l: A4.l - 2 * marge, h: A4.h - 2 * marge - 46 }
    const k = Math.min(dispo.l / p.l, dispo.h / p.h)
    const l = p.l * k
    const h = p.h * k
    const x = (A4.l - l) / 2
    const y = marge + (dispo.h - h) / 2
    const flux = octetsDe(
      `BT /F1 15 Tf ${marge} ${A4.h - marge - 6} Td ${litteral(p.titre)} Tj ET\n` +
      `BT /F1 9 Tf ${marge} ${A4.h - marge - 24} Td ${litteral(p.sous)} Tj ET\n` +
      `q ${l.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q\n`,
    )
    objet(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.l} ${A4.h}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    objet(n + 1, `<< /Length ${flux.length} >>`, flux)
    objet(n + 2, `<< /Type /XObject /Subtype /Image /Width ${p.l} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg)
  })

  const nombre = 3 + 3 * pages.length + 1
  const debutXref = taille
  // Chaque entrée fait exactement vingt octets — la table se lit par décalage,
  // pas par analyse, et un octet de trop la rend illisible.
  let xref = `xref\n0 ${nombre}\n0000000000 65535 f \n`
  for (let n = 1; n < nombre; n++) xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`
  ecrire(xref)
  ecrire(`trailer\n<< /Size ${nombre} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`)

  return new Blob(morceaux as BlobPart[], { type: 'application/pdf' })
}

/** Une page par temps, le nom et la note en tête. */
async function fabriquerPdf(schema: Schema): Promise<Blob> {
  const h = profondeur(schema)
  // 1200 de large : de quoi imprimer proprement sans peser des mégaoctets.
  const l = 1200
  const hi = Math.round((h / W) * l)
  const pages = []
  for (let i = 0; i < schema.temps.length; i++) {
    const canvas = await rasteriser(await svgAutonome(schema, schema.temps[i], l, hi), l, hi)
    const jpeg = new Uint8Array(await (await enBlob(canvas, 'image/jpeg', 0.85)).arrayBuffer())
    pages.push({
      jpeg, l, h: hi,
      titre: `${schema.nom} — temps ${i + 1} / ${schema.temps.length}`,
      sous: schema.note?.slice(0, 110) || (schema.terrain === 'demi' ? 'Demi-terrain' : 'Terrain complet'),
    })
  }
  return assemblerPdf(pages)
}

// ─────────────────────────────── Le GIF ───────────────────────────────

/** Dix images par seconde, la durée de transition du lecteur : le GIF montre la
 *  combinaison au même rythme que l'écran du temps-mort. */
const PAR_TRANSITION = 15
/** Le côté le plus long. Une messagerie recompresse tout au-delà, et chaque
 *  pixel se paie quarante fois — une fois par image. */
const COTE_GIF = 480

/**
 * Le cube 6×6×6 : deux cent seize couleurs fixes, l'index se calcule sans
 * chercher. Le tableau tactique est fait d'aplats — fond sombre, rose, ambre,
 * blanc — donc une palette adaptative ne gagnerait presque rien pour beaucoup
 * plus de code.
 */
const paletteGif = () => {
  const t = new Uint8Array(256 * 3)
  for (let i = 0; i < 216; i++) {
    t[i * 3] = Math.floor(i / 36) * 51
    t[i * 3 + 1] = (Math.floor(i / 6) % 6) * 51
    t[i * 3 + 2] = (i % 6) * 51
  }
  return t
}

/**
 * L'LZW du format GIF. Le dictionnaire est indexé par (préfixe, octet) sur un
 * entier plutôt que par une chaîne : c'est la même chose en dix fois plus
 * rapide, et une animation, ce sont des millions de pixels.
 */
function lzw(pixels: Uint8Array): number[] {
  const CLEAR = 256
  const FIN = 257
  const sortie: number[] = []
  let tampon = 0
  let bits = 0
  let largeur = 9
  const emettre = (code: number) => {
    tampon |= code << bits
    bits += largeur
    while (bits >= 8) {
      sortie.push(tampon & 255)
      tampon >>>= 8
      bits -= 8
    }
  }
  let table = new Map<number, number>()
  let suivant = 258
  emettre(CLEAR)
  let prefixe = pixels[0]
  for (let i = 1; i < pixels.length; i++) {
    const cle = prefixe * 256 + pixels[i]
    const connu = table.get(cle)
    if (connu !== undefined) {
      prefixe = connu
      continue
    }
    emettre(prefixe)
    table.set(cle, suivant++)
    if (suivant === 4096) {
      // Dictionnaire plein : on repart de zéro, décodeur compris.
      emettre(CLEAR)
      table = new Map()
      suivant = 258
      largeur = 9
    } else if (suivant - 1 === 1 << largeur) {
      largeur++
    }
    prefixe = pixels[i]
  }
  emettre(prefixe)
  emettre(FIN)
  if (bits > 0) sortie.push(tampon & 255)
  return sortie
}

/** Le flux LZW découpé en sous-blocs de 255 octets, comme le veut le format. */
const sousBlocs = (octets: number[]) => {
  const out: number[] = []
  for (let i = 0; i < octets.length; i += 255) {
    const bout = octets.slice(i, i + 255)
    out.push(bout.length, ...bout)
  }
  out.push(0)
  return out
}

/** Les instants à photographier : chaque transition en `PAR_TRANSITION` images,
 *  puis le dernier temps, qu'on tient un instant pour qu'il se lise. */
function instants(s: Schema) {
  const n = transitions(s)
  const liste: { temps: number; part: number }[] = []
  for (let t = 0; t < n; t++) for (let i = 0; i < PAR_TRANSITION; i++) liste.push({ temps: t, part: i / PAR_TRANSITION })
  liste.push({ temps: n, part: 0 })
  return liste
}

async function fabriquerGif(schema: Schema, avance?: (fait: number, total: number) => void): Promise<Blob> {
  const h = profondeur(schema)
  const k = COTE_GIF / Math.max(W, h)
  const l = Math.round(W * k)
  const hi = Math.round(h * k)
  const liste = instants(schema)

  const octets: number[] = []
  octets.push(...octetsDe('GIF89a'))
  // Écran logique, table globale de 256 entrées (0xF7), puis la palette.
  octets.push(l & 255, l >> 8, hi & 255, hi >> 8, 0xf7, 0, 0)
  octets.push(...paletteGif())
  // Boucle infinie : l'extension NETSCAPE2.0, seule façon de le dire en GIF.
  octets.push(0x21, 0xff, 0x0b, ...octetsDe('NETSCAPE2.0'), 0x03, 0x01, 0xff, 0xff, 0x00)

  for (let i = 0; i < liste.length; i++) {
    const canvas = await rasteriser(await svgAutonome(schema, instantane(schema, liste[i]), l, hi), l, hi)
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, l, hi).data
    const indices = new Uint8Array(l * hi)
    for (let p = 0; p < indices.length; p++) {
      indices[p] = Math.round(rgba[p * 4] / 51) * 36 + Math.round(rgba[p * 4 + 1] / 51) * 6 + Math.round(rgba[p * 4 + 2] / 51)
    }
    // Le dernier temps reste une seconde et demie à l'écran : sans cette pause,
    // la boucle repart avant qu'on ait vu où les joueurs finissent.
    // Les délais sont en centièmes de seconde : 10 pour dix images par seconde.
    const delai = i === liste.length - 1 ? 150 : 10
    octets.push(0x21, 0xf9, 0x04, 0x04, delai & 255, delai >> 8, 0, 0)
    octets.push(0x2c, 0, 0, 0, 0, l & 255, l >> 8, hi & 255, hi >> 8, 0)
    octets.push(8, ...sousBlocs(lzw(indices)))
    avance?.(i + 1, liste.length)
  }
  octets.push(0x3b)
  return new Blob([Uint8Array.from(octets)], { type: 'image/gif' })
}

// ────────────────────────── La remise du fichier ──────────────────────────

/**
 * Le geste attendu sur un téléphone, c'est le partage natif ; partout ailleurs,
 * c'est le téléchargement. Un partage refusé — navigateur qui n'accepte pas les
 * fichiers, ou utilisateur qui annule — ne doit pas laisser l'écran les mains
 * vides : on retombe sur le téléchargement.
 */
export async function livrer(fichier: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && (!nav.canShare || nav.canShare({ files: [fichier] }))) {
    try {
      await nav.share({ files: [fichier], title: fichier.name })
      return
    } catch (e) {
      // Annulation volontaire : on ne télécharge pas dans le dos de l'utilisateur.
      if ((e as Error)?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(fichier)
  const a = document.createElement('a')
  a.href = url
  a.download = fichier.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ──────────────────────────────── L'écran ────────────────────────────────

export function ExportSchema({ schema, tempsIndex = 0, open, onClose }: {
  schema: Schema
  /** Le temps affiché : c'est celui-là que l'image reprend. */
  tempsIndex?: number
  open: boolean
  onClose: () => void
}) {
  // `undefined` : le codage est en cours. `null` : le schéma ne tient pas dans
  // une URL, et on le dit au lieu de produire un lien qui se tronquerait.
  const trad = useT()
  const [lien, setLien] = useState<string | null | undefined>(undefined)
  const [etat, setEtat] = useState('')
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    if (!open) return
    let vivant = true
    setEtat('')
    encoder(schema).then((code) => {
      if (vivant) setLien(code.length > LIMITE_LIEN ? null : `${location.origin}/schemas/recu#${code}`)
    })
    return () => { vivant = false }
  }, [open, schema])

  /** Toute sortie fichier suit le même chemin : on annonce, on fabrique, on
   *  remet — et si l'appareil ne sait pas dessiner, on le dit franchement. */
  const sortie = (libelle: string, faire: () => Promise<Blob>, ext: string, type: string) => async () => {
    setOccupe(true)
    setEtat(`${libelle} en préparation…`)
    try {
      const blob = await faire()
      await livrer(new File([blob], nomFichier(schema, ext), { type }))
      setEtat(`${libelle} : ${Math.round(blob.size / 1024)} ko prêts.`)
    } catch {
      setEtat(`${libelle} : cet appareil n’a pas pu produire le fichier.`)
    } finally {
      setOccupe(false)
    }
  }

  const copier = async () => {
    if (!lien) return
    try {
      await navigator.clipboard?.writeText(lien)
      setEtat(trad('partage.lienCopie'))
    } catch {
      setEtat(trad('partage.pressePapiersRefuse'))
    }
    if (navigator.share) {
      try { await navigator.share({ title: schema.nom, url: lien }) } catch { /* partage annulé */ }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">{trad('partage.titre', { nom: schema.nom })}</DialogTitle>
        </DialogHeader>

        {lien === undefined && <p className="text-[13px]" style={{ color: C.muted }}>{trad('partage.preparation')}</p>}

        {lien === null && (
          <p className="rounded-xl p-3 text-[13px]" style={{ background: C.amberBg, color: C.amber }}>
            Cette combinaison est trop chargée pour tenir dans un lien. Envoyez plutôt l’image ou le PDF —
            un lien tronqué en route serait pire que pas de lien.
          </p>
        )}

        {lien && (
          <>
            <p className="text-[13px] leading-relaxed" style={{ color: C.muted }}>
              {trad('partage.explication')}
            </p>
            <input
              readOnly value={lien} aria-label={trad('partage.lienCombinaison')}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full truncate rounded-xl bg-[var(--c-card2)] px-3 py-2 text-[12px] outline-none"
              style={{ border: bd, color: C.muted }}
            />
            <button
              onClick={copier}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-[var(--c-on-brand)] transition hover:brightness-110"
              style={{ background: C.brand }}
            >
              <Link2 className="h-4 w-4 shrink-0" strokeWidth={2} />
              {trad('partage.copierLien')}
            </button>
          </>
        )}

        {/* Les trois sorties fichier sont une seconde famille, pas trois boutons de
            plus : un filet et un titre disent qu'on change de moyen, et chaque
            bouton annonce ce qu'il produit — un temps, tous les temps, l'animation. */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.faint }}>{trad('partage.ouEnvoyerFichier')}</span>
          <span className="h-px flex-1" style={{ background: C.border }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Sortie label={trad('partage.imagePng')} quoi={trad('partage.ceTemps')} disabled={occupe} onClick={sortie('L’image', () => fabriquerPng(schema, schema.temps[tempsIndex] ?? schema.temps[0]), 'png', 'image/png')} />
          <Sortie label={trad('partage.pdf')} quoi={trad('partage.tousLesTemps')} disabled={occupe} onClick={sortie('Le PDF', () => fabriquerPdf(schema), 'pdf', 'application/pdf')} />
          <Sortie
            label={trad('partage.gif')} quoi={trad('partage.animation')} disabled={occupe}
            onClick={sortie('Le GIF', () => fabriquerGif(schema, (fait, total) => setEtat(`Le GIF en préparation… ${fait} / ${total}`)), 'gif', 'image/gif')}
          />
        </div>

        {etat && <p aria-live="polite" className="text-[12px] font-semibold" style={{ color: C.muted }}>{etat}</p>}
      </DialogContent>
    </Dialog>
  )
}

/** `aria-label` explicite : la précision sous le titre aide l'œil, elle n'a rien
 *  à faire dans le nom du bouton — qui reste « PDF », pas « PDF tous les temps ». */
function Sortie({ label, quoi, onClick, disabled }: { label: string; quoi: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2.5 transition hover:brightness-125 disabled:opacity-40"
      style={{ background: C.card2, border: bd, color: C.text }}
    >
      <span className="text-[13px] font-bold">{label}</span>
      <span className="text-[12px] font-semibold" style={{ color: C.muted }}>{quoi}</span>
    </button>
  )
}
