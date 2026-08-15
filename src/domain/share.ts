/**
 * The link carries the play. A compressed play fits inside a URL: no server, no
 * account, no shared database, and the link never expires. The payload sits in the
 * **fragment** (`#…`), which is sent to no server and lands in no access log.
 *
 * The compression is the platform's — `CompressionStream('deflate-raw')`, available
 * everywhere since 2023 — so there is no dependency.
 */
import type { Prop, Play, Step, Court } from './plays'

/** Beyond this, a URL becomes fragile in messaging apps: better to offer the image or
 *  the PDF than a link that would be truncated in silence. */
export const LINK_LIMIT = 8000

/** What travels. `id`, `clubId`, `updatedAt` and `folder` stay with the sender: a
 *  received play is a brand-new play, so it cannot overwrite anyone's. */
interface Transport {
  name: string
  note?: string
  court: Court
  defense: boolean
  props: Prop[]
  steps: Step[]
}

const toB64url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (o) => String.fromCharCode(o)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromB64url = (code: string) => {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The bytes streamed in one go. We go through `ReadableStream` rather than
 *  `Blob.stream()`: jsdom does not implement the latter, and the domain's tests must
 *  not depend on what a browser has that jsdom lacks. */
const asStream = (bytes: Uint8Array<ArrayBuffer>) => new ReadableStream<Uint8Array<ArrayBuffer>>({
  start(c) { c.enqueue(bytes); c.close() },
})

/** The play compressed and encoded, ready to place after a URL's `#`. */
export async function encode(s: Play): Promise<string> {
  const payload: Transport = {
    name: s.name, note: s.note, court: s.court, defense: s.defense, props: s.props, steps: s.steps,
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const stream = asStream(bytes).pipeThrough(new CompressionStream('deflate-raw'))
  return toB64url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** A usable point: two finite numbers. `NaN` and `Infinity` get through
 *  `typeof === 'number'` and would come out as unreadable SVG attributes. */
const isPoint = (v: unknown): boolean =>
  isObject(v) && Number.isFinite(v.x) && Number.isFinite(v.y)

/** A marker, or the ball's carrier: a known side and a position from 1 to 5. */
const isSlot = (v: unknown): boolean =>
  isObject(v) && (v.side === 'offense' || v.side === 'defense')
  && typeof v.position === 'number' && v.position >= 1 && v.position <= 5

/**
 * The shape, genuinely checked, **all the way down the arrays**. This is the only
 * boundary through which data from elsewhere enters the app: a link truncated at a
 * point that leaves the JSON valid, or edited by hand, decompresses into a
 * half-correct object. Stopping at the containers would let it through, and rendering
 * would throw on a marker with no position — with no error boundary to catch it, React
 * unmounts everything and you get the blank screen this decoder exists to prevent.
 */
function isTransport(v: unknown): v is Transport {
  if (!isObject(v)) return false
  if (typeof v.name !== 'string') return false
  if (v.note !== undefined && typeof v.note !== 'string') return false
  if (v.court !== 'half' && v.court !== 'full') return false
  if (!Array.isArray(v.props) || !v.props.every((o) => isObject(o) && typeof o.kind === 'string' && isPoint(o.at))) return false
  if (!Array.isArray(v.steps) || v.steps.length === 0) return false
  return v.steps.every((t) =>
    isObject(t)
    && Array.isArray(t.markers) && t.markers.length > 0
    && t.markers.every((p) => isSlot(p) && isPoint((p as Record<string, unknown>).at))
    // The ball is carried by a marker, or resting somewhere: both shapes,
    // and nothing else.
    && (isPoint(t.ball) || isSlot(t.ball))
    && Array.isArray(t.arrows)
    && t.arrows.every((f) =>
      isObject(f)
      && isSlot(f.from)
      && typeof f.stroke === 'string'
      && Array.isArray(f.points) && f.points.length >= 2 && f.points.every(isPoint)),
  )
}

/** The inverse. Returns `null` on text that is not a valid play. */
export async function decode(code: string): Promise<Play | null> {
  if (!code) return null
  try {
    const stream = asStream(fromB64url(code)).pipeThrough(new DecompressionStream('deflate-raw'))
    const parsed: unknown = JSON.parse(await new Response(stream).text())
    if (!isTransport(parsed)) return null
    // Fields absent from the payload return to their neutral value: with no id and no
    // club, the received play is a new one.
    return { id: '', clubId: '', ...parsed, defense: !!parsed.defense }
  } catch {
    return null
  }
}
