/**
 * The link carries the play. A compressed play fits inside a URL: no server, no
 * account, no shared database, and the link never expires. The payload sits in the
 * **fragment** (`#…`), which is sent to no server and lands in no access log.
 *
 * La compression est celle de la plateforme — `CompressionStream('deflate-raw')`,
 * available everywhere since 2023 — so there is no dependency.
 */
import type { Prop, Play, Step, Court } from './plays'

/** Beyond this, a URL becomes fragile in messaging apps: better to offer
 *  l'image ou le PDF qu'un lien qui se tronquerait en silence. */
export const LIMITE_LIEN = 8000

/** What travels. `id`, `clubId`, `updatedAt` and `folder` stay with the sender: a
 *  received play is a brand-new play, so it cannot overwrite anyone's. */
interface Transport {
  nom: string
  note?: string
  court: Court
  defense: boolean
  props: Prop[]
  temps: Step[]
}

const versB64url = (octets: Uint8Array) =>
  btoa(Array.from(octets, (o) => String.fromCharCode(o)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const depuisB64url = (code: string) => {
  const binaire = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0))
}

/** The bytes streamed in one go. We go through `ReadableStream` rather than
 *  `Blob.stream()`: jsdom does not implement the latter, and the domain's tests must
 *  not depend on what a browser has that jsdom lacks. */
const enFlux = (octets: Uint8Array<ArrayBuffer>) => new ReadableStream<Uint8Array<ArrayBuffer>>({
  start(c) { c.enqueue(octets); c.close() },
})

/** The play compressed and encoded, ready to place after a URL's `#`. */
export async function encoder(s: Play): Promise<string> {
  const utile: Transport = {
    nom: s.nom, note: s.note, court: s.court, defense: s.defense, props: s.props, temps: s.temps,
  }
  const octets = new TextEncoder().encode(JSON.stringify(utile))
  const stream = enFlux(octets).pipeThrough(new CompressionStream('deflate-raw'))
  return versB64url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Un point exploitable : deux nombres finis. `NaN` et `Infinity` traversent
 *  `typeof === 'number'` et ressortiraient en attributs SVG illisibles. */
const estPoint = (v: unknown): boolean =>
  estObjet(v) && Number.isFinite(v.x) && Number.isFinite(v.y)

/** A marker, or the ball's carrier: a known side and a position from 1 to 5. */
const estPorteur = (v: unknown): boolean =>
  estObjet(v) && (v.side === 'offense' || v.side === 'defense')
  && typeof v.position === 'number' && v.position >= 1 && v.position <= 5

/**
 * The shape, genuinely checked, **all the way down the arrays**. This is the only
 * boundary through which data from elsewhere enters the app: a link truncated at a
 * point that leaves the JSON valid, or edited by hand, decompresses into a
 * half-correct object. Stopping at the containers would let it through, and rendering
 * would throw on a marker with no position — with no error boundary to catch it, React
 * unmounts everything and you get the blank screen this decoder exists to prevent.
 */
function estTransport(v: unknown): v is Transport {
  if (!estObjet(v)) return false
  if (typeof v.nom !== 'string') return false
  if (v.note !== undefined && typeof v.note !== 'string') return false
  if (v.court !== 'half' && v.court !== 'full') return false
  if (!Array.isArray(v.props) || !v.props.every((o) => estObjet(o) && typeof o.kind === 'string' && estPoint(o.at))) return false
  if (!Array.isArray(v.temps) || v.temps.length === 0) return false
  return v.temps.every((t) =>
    estObjet(t)
    && Array.isArray(t.markers) && t.markers.length > 0
    && t.markers.every((p) => estPorteur(p) && estPoint((p as Record<string, unknown>).at))
    // The ball is carried by a marker, or resting somewhere: both shapes,
    // et rien d'autre.
    && (estPoint(t.ball) || estPorteur(t.ball))
    && Array.isArray(t.arrows)
    && t.arrows.every((f) =>
      estObjet(f)
      && estPorteur(f.from)
      && typeof f.stroke === 'string'
      && Array.isArray(f.points) && f.points.length >= 2 && f.points.every(estPoint)),
  )
}

/** The inverse. Returns `null` on text that is not a valid play. */
export async function decoder(code: string): Promise<Play | null> {
  if (!code) return null
  try {
    const stream = enFlux(depuisB64url(code)).pipeThrough(new DecompressionStream('deflate-raw'))
    const lu: unknown = JSON.parse(await new Response(stream).text())
    if (!estTransport(lu)) return null
    // Fields absent from the payload return to their neutral value: with no id and no
    // club, the received play is a new one.
    return { id: '', clubId: '', ...lu, defense: !!lu.defense }
  } catch {
    return null
  }
}
