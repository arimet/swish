/**
 * Getting a play out of the application: a link that carries the whole of it, an
 * image, a PDF, an animated GIF.
 *
 * The link comes first: it is the only one that keeps the animation, and it asks
 * nothing of anyone — the play travels in the fragment, there is no server, no
 * account, no synchronisation. That is also what makes it long, and the screen says
 * so rather than letting anyone think something is broken.
 *
 * The three file outputs start from the same gesture: the board rendered as SVG,
 * rasterised into a canvas on an opaque background. No dependency — the PDF and the
 * GIF are written byte by byte below, which costs two hundred lines against several
 * hundred kilobytes of library.
 *
 * Sharing and exporting are **ungated**: nothing is modified, no code is asked for,
 * whatever the role.
 */
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { snapshot, transitions } from '../../domain/anim'
import { LIMITE_LIEN, encoder } from '../../domain/partage'
import type { Play, Step } from '../../domain/plays'
import { C, bd } from '../olive/kit'
import { useT } from '../../i18n'
import { PlayBoard } from './PlayBoard'
import { D, W } from './ShotCourt'
import { Link2 } from 'lucide-react'

/** The viewBox's depth: a full court is the half court and its mirror. */
const depth = (s: Play) => (s.court === 'full' ? D * 2 : D)

/** The file name, stripped of what a file system dislikes. */
const fileName = (s: Play, ext: string) =>
  `${(s.name || 'schéma').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'schema'}.${ext}`

/** The off-screen renderer only arrives on the first share: two hundred kilobytes
 *  a coach has no business downloading to open a match sheet. The service worker
 *  caches it like the rest of the bundle, so sharing works offline too. */
const renderer = async () => (await import('react-dom/server')).renderToStaticMarkup

/**
 * The board as a standalone SVG. The node on screen is not enough: the PDF wants one
 * step per page and the GIF one frame every tenth of a second, so we render the
 * component on demand rather than serialise what is displayed.
 *
 * `width`/`height` are added because an `Image` refuses to rasterise an SVG that has
 * only its `viewBox`, and React's typographic quotation marks in ids are stripped:
 * this SVG is re-read by a strict XML parser.
 */
async function standaloneSvg(schema: Play, step: Step, width: number, height: number): Promise<string> {
  const toMarkup = await renderer()
  return toMarkup(<PlayBoard schema={schema} stepIndex={0} step={step} apercu />)
    .replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`)
    .replace(/[«»]/g, '_')
}

/** The SVG drawn into a canvas, **on an opaque background**: a transparent PNG
 *  dropped into a dark messaging app becomes illegible. */
async function rasterise(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok()
      img.onerror = () => ko(new Error('the board could not be rasterised'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.fillStyle = C.frame
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('empty image'))), type, q))

/** The step rendered at twice its viewBox — 3000 × 2800 for a half court, an image
 *  that holds up on a changing-room wall. */
async function makePng(schema: Play, step: Step): Promise<Blob> {
  const h = depth(schema)
  const canvas = await rasterise(await standaloneSvg(schema, step, W * 2, h * 2), W * 2, h * 2)
  return toBlob(canvas, 'image/png')
}

// ─────────────────────────────── The PDF ───────────────────────────────

const bytesOf = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

/** What the repo writes that latin-1 cannot encode: typographic punctuation — em
 *  dashes, curly apostrophes — and `œ`, the only French letter above latin-1. All of
 *  it exists in `WinAnsiEncoding`. Without this table a title would print as
 *  "Pick and roll ? temps 1 / 4" and a "combinaison cœur" would become "c?ur".
 *  The French guillemets are not in it: `«` and `»` already land on the right codes
 *  through latin-1. */
const WINANSI: Record<string, number> = {
  '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  'Œ': 0x8c, 'œ': 0x9c, 'Š': 0x8a, 'š': 0x9a, 'Ÿ': 0x9f, '€': 0x80,
}

/** A PDF string literal. What has no room in `WinAnsiEncoding` — an emoji in a
 *  play's name — becomes a question mark rather than shifting the whole
 *  byte-by-byte layout. */
const literal = (s: string) =>
  `(${[...s].map((c) => {
    if ('()\\'.includes(c)) return '\\' + c
    if (WINANSI[c]) return String.fromCharCode(WINANSI[c])
    return c.charCodeAt(0) > 255 ? '?' : c
  }).join('')})`

/**
 * A hand-written PDF: header, one object per page, a JPEG image embedded as is
 * (`DCTDecode` takes the canvas bytes without touching them), a cross-reference
 * table. It is a simple format as soon as you stick to images and a base font — and
 * it avoids a whole dependency.
 */
function assemblePdf(pages: { jpeg: Uint8Array; l: number; h: number; title: string; sub: string }[]): Blob {
  const A4 = { l: 595, h: 842 }
  const margin = 40
  const chunks: Uint8Array[] = []
  let size = 0
  const write = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? bytesOf(x) : x
    chunks.push(b)
    size += b.length
  }
  const offsets: number[] = []
  const obj = (num: number, body: string, stream?: Uint8Array) => {
    offsets[num] = size
    write(`${num} 0 obj\n${body}\n`)
    if (stream) {
      write('stream\n')
      write(stream)
      write('\nendstream\n')
    }
    write('endobj\n')
  }

  // The binary comment on the second line: it tells tools the file is not text, and
  // without it some of them transmit it crooked.
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  const pageNum = (i: number) => 4 + 3 * i
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageNum(i)} 0 R`).join(' ')}] >>`)
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

  pages.forEach((p, i) => {
    const n = pageNum(i)
    // The image takes what is left under the title, never distorted, and stays
    // centred in that room: a half court pinned to the bottom of the page would leave
    // a white band where the eye looks for the drawing.
    const avail = { l: A4.l - 2 * margin, h: A4.h - 2 * margin - 46 }
    const k = Math.min(avail.l / p.l, avail.h / p.h)
    const l = p.l * k
    const h = p.h * k
    const x = (A4.l - l) / 2
    const y = margin + (avail.h - h) / 2
    const stream = bytesOf(
      `BT /F1 15 Tf ${margin} ${A4.h - margin - 6} Td ${literal(p.title)} Tj ET\n` +
      `BT /F1 9 Tf ${margin} ${A4.h - margin - 24} Td ${literal(p.sub)} Tj ET\n` +
      `q ${l.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q\n`,
    )
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.l} ${A4.h}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    obj(n + 1, `<< /Length ${stream.length} >>`, stream)
    obj(n + 2, `<< /Type /XObject /Subtype /Image /Width ${p.l} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg)
  })

  const count = 3 + 3 * pages.length + 1
  const xrefStart = size
  // Each entry is exactly twenty bytes — the table is read by offset, not by
  // parsing, and one byte too many makes it unreadable.
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let n = 1; n < count; n++) xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`
  write(xref)
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/** One page per step, the name and the note at the top. */
async function makePdf(schema: Play): Promise<Blob> {
  const h = depth(schema)
  // 1200 wide: enough to print cleanly without weighing megabytes.
  const l = 1200
  const hi = Math.round((h / W) * l)
  const pages = []
  for (let i = 0; i < schema.steps.length; i++) {
    const canvas = await rasterise(await standaloneSvg(schema, schema.steps[i], l, hi), l, hi)
    const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.85)).arrayBuffer())
    pages.push({
      jpeg, l, h: hi,
      title: `${schema.name} — temps ${i + 1} / ${schema.steps.length}`,
      sub: schema.note?.slice(0, 110) || (schema.court === 'half' ? 'Demi-terrain' : 'Terrain complet'),
    })
  }
  return assemblePdf(pages)
}

// ─────────────────────────────── The GIF ───────────────────────────────

/** Ten frames per second, the player's transition duration: the GIF shows the play
 *  at the same pace as the time-out screen. */
const FRAMES_PER_TRANSITION = 15
/** The longest side. A messaging app recompresses anything beyond it, and every
 *  pixel is paid for forty times — once per frame. */
const GIF_SIDE = 480

/**
 * The 6×6×6 cube: two hundred and sixteen fixed colours, the index computed without
 * searching. The tactical board is made of flat areas — background, attack colour,
 * amber, white — so an adaptive palette would gain almost nothing for a great deal
 * more code.
 */
const gifPalette = () => {
  const t = new Uint8Array(256 * 3)
  for (let i = 0; i < 216; i++) {
    t[i * 3] = Math.floor(i / 36) * 51
    t[i * 3 + 1] = (Math.floor(i / 6) % 6) * 51
    t[i * 3 + 2] = (i % 6) * 51
  }
  return t
}

/**
 * The GIF format's LZW. The dictionary is indexed by (prefix, byte) on an integer
 * rather than by a string: the same thing ten times faster, and an animation is
 * millions of pixels.
 */
function lzw(pixels: Uint8Array): number[] {
  const CLEAR = 256
  const FIN = 257
  const out: number[] = []
  let buf = 0
  let bits = 0
  let width = 9
  const emit = (code: number) => {
    buf |= code << bits
    bits += width
    while (bits >= 8) {
      out.push(buf & 255)
      buf >>>= 8
      bits -= 8
    }
  }
  let table = new Map<number, number>()
  let next = 258
  emit(CLEAR)
  let prefix = pixels[0]
  for (let i = 1; i < pixels.length; i++) {
    const key = prefix * 256 + pixels[i]
    const known = table.get(key)
    if (known !== undefined) {
      prefix = known
      continue
    }
    emit(prefix)
    table.set(key, next++)
    if (next === 4096) {
      // Dictionary full: we start over, decoder included.
      emit(CLEAR)
      table = new Map()
      next = 258
      width = 9
    } else if (next - 1 === 1 << width) {
      width++
    }
    prefix = pixels[i]
  }
  emit(prefix)
  emit(FIN)
  if (bits > 0) out.push(buf & 255)
  return out
}

/** The LZW stream cut into 255-byte sub-blocks, as the format wants. */
const subBlocks = (bytes: number[]) => {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255)
    out.push(chunk.length, ...chunk)
  }
  out.push(0)
  return out
}

/** The instants to photograph: each transition in `FRAMES_PER_TRANSITION` frames,
 *  then the last step, held a moment so it can be read. */
function frames(s: Play) {
  const n = transitions(s)
  const list: { step: number; part: number }[] = []
  for (let t = 0; t < n; t++) for (let i = 0; i < FRAMES_PER_TRANSITION; i++) list.push({ step: t, part: i / FRAMES_PER_TRANSITION })
  list.push({ step: n, part: 0 })
  return list
}

async function makeGif(schema: Play, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const h = depth(schema)
  const k = GIF_SIDE / Math.max(W, h)
  const l = Math.round(W * k)
  const hi = Math.round(h * k)
  const list = frames(schema)

  const bytes: number[] = []
  bytes.push(...bytesOf('GIF89a'))
  // Logical screen, global table of 256 entries (0xF7), then the palette.
  bytes.push(l & 255, l >> 8, hi & 255, hi >> 8, 0xf7, 0, 0)
  bytes.push(...gifPalette())
  // Infinite loop: the NETSCAPE2.0 extension, the only way to say it in GIF.
  bytes.push(0x21, 0xff, 0x0b, ...bytesOf('NETSCAPE2.0'), 0x03, 0x01, 0xff, 0xff, 0x00)

  for (let i = 0; i < list.length; i++) {
    const canvas = await rasterise(await standaloneSvg(schema, snapshot(schema, list[i]), l, hi), l, hi)
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, l, hi).data
    const indexes = new Uint8Array(l * hi)
    for (let p = 0; p < indexes.length; p++) {
      indexes[p] = Math.round(rgba[p * 4] / 51) * 36 + Math.round(rgba[p * 4 + 1] / 51) * 6 + Math.round(rgba[p * 4 + 2] / 51)
    }
    // The last step stays a second and a half on screen: without that pause the loop
    // restarts before you have seen where the players end up.
    // Delays are in hundredths of a second: 10 for ten frames per second.
    const delay = i === list.length - 1 ? 150 : 10
    bytes.push(0x21, 0xf9, 0x04, 0x04, delay & 255, delay >> 8, 0, 0)
    bytes.push(0x2c, 0, 0, 0, 0, l & 255, l >> 8, hi & 255, hi >> 8, 0)
    bytes.push(8, ...subBlocks(lzw(indexes)))
    onProgress?.(i + 1, list.length)
  }
  bytes.push(0x3b)
  return new Blob([Uint8Array.from(bytes)], { type: 'image/gif' })
}

// ────────────────────────── Handing over the file ──────────────────────────

/**
 * The expected gesture on a phone is the native share; everywhere else it is a
 * download. A refused share — a browser that will not take files, or a user who
 * cancels — must not leave the screen empty-handed: we fall back to the download.
 */
export async function deliver(file: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title: file.name })
      return
    } catch (e) {
      // A deliberate cancel: we do not download behind the user's back.
      if ((e as Error)?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ──────────────────────────────── The screen ────────────────────────────────

export function ExportSchema({ schema, stepIndex = 0, open, onClose }: {
  schema: Play
  /** The step displayed: that is the one the image takes up. */
  stepIndex?: number
  open: boolean
  onClose: () => void
}) {
  // `undefined`: encoding is under way. `null`: the play does not fit in a URL, and
  // we say so instead of producing a link that would get truncated.
  const translate = useT()
  const [link, setLink] = useState<string | null | undefined>(undefined)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setStatus('')
    encoder(schema).then((code) => {
      if (alive) setLink(code.length > LIMITE_LIEN ? null : `${location.origin}/schemas/recu#${code}`)
    })
    return () => { alive = false }
  }, [open, schema])

  /** Every file output follows the same path: announce, build, hand over — and if
   *  the device cannot draw, say so plainly. */
  const out = (label: string, faire: () => Promise<Blob>, ext: string, type: string) => async () => {
    setBusy(true)
    setStatus(translate('share.building', { what: label }))
    try {
      const blob = await faire()
      await deliver(new File([blob], fileName(schema, ext), { type }))
      setStatus(translate('share.ready', { what: label, kb: Math.round(blob.size / 1024) }))
    } catch {
      setStatus(translate('share.fileFailed', { what: label }))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard?.writeText(link)
      setStatus(translate('share.linkCopied'))
    } catch {
      setStatus(translate('share.clipboardRefused'))
    }
    if (navigator.share) {
      try { await navigator.share({ title: schema.name, url: link }) } catch { /* share cancelled */ }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">{translate('share.title', { name: schema.name })}</DialogTitle>
        </DialogHeader>

        {link === undefined && <p className="text-[13px]" style={{ color: C.muted }}>{translate('share.preparing')}</p>}

        {link === null && (
          <p className="rounded-xl p-3 text-[13px]" style={{ background: C.amberBg, color: C.amber }}>
            {translate('share.tooLong')}
          </p>
        )}

        {link && (
          <>
            <p className="text-[13px] leading-relaxed" style={{ color: C.muted }}>
              {translate('share.explanation')}
            </p>
            <input
              readOnly value={link} aria-label={translate('share.playLink')}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full truncate rounded-xl bg-[var(--c-card2)] px-3 py-2 text-[12px] outline-none"
              style={{ border: bd, color: C.muted }}
            />
            <button
              onClick={copy}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-[var(--c-on-brand)] transition hover:brightness-110"
              style={{ background: C.brand }}
            >
              <Link2 className="h-4 w-4 shrink-0" strokeWidth={2} />
              {translate('share.copyLink')}
            </button>
          </>
        )}

        {/* The three file outputs are a second family, not three more buttons: a rule
            and a heading say the medium changes, and each button announces what it
            produces — one step, every step, the animation. */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.faint }}>{translate('share.orSendAFile')}</span>
          <span className="h-px flex-1" style={{ background: C.border }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FileButton label={translate('share.png')} what={translate('share.thisStep')} disabled={busy} onClick={out(translate('share.theImage'), () => makePng(schema, schema.steps[stepIndex] ?? schema.steps[0]), 'png', 'image/png')} />
          <FileButton label={translate('share.pdf')} what={translate('share.everyStep')} disabled={busy} onClick={out(translate('share.thePdf'), () => makePdf(schema), 'pdf', 'application/pdf')} />
          <FileButton
            label={translate('share.gif')} what={translate('share.animation')} disabled={busy}
            onClick={out(translate('share.theGif'), () => makeGif(schema, (done, total) => setStatus(translate('share.gifProgress', { done: done, total }))), 'gif', 'image/gif')}
          />
        </div>

        {status && <p aria-live="polite" className="text-[12px] font-semibold" style={{ color: C.muted }}>{status}</p>}
      </DialogContent>
    </Dialog>
  )
}

/** An explicit `aria-label`: the qualifier under the title helps the eye, it has no
 *  business in the button's name — which stays "PDF", not "PDF every step". */
function FileButton({ label, what, onClick, disabled }: { label: string; what: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2.5 transition hover:brightness-125 disabled:opacity-40"
      style={{ background: C.card2, border: bd, color: C.text }}
    >
      <span className="text-[13px] font-bold">{label}</span>
      <span className="text-[12px] font-semibold" style={{ color: C.muted }}>{what}</span>
    </button>
  )
}
