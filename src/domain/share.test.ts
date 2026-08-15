import { describe, expect, it } from 'vitest'
import { encode, decode, LINK_LIMIT } from './share'
import { newPlay, nextStep, type Play } from './plays'

const full = (): Play => {
  const s: Play = { id: 'x1', ...newPlay('club-a', 'full', true), name: 'Presse tout terrain', note: 'Sortie de balle' }
  const t0 = { ...s.steps[0], arrows: [{ from: { side: 'offense' as const, position: 1 as const }, stroke: 'dribble' as const, points: [{ x: 0.5, y: 0.4 }, { x: 0.3, y: 0.25 }] }] }
  return { ...s, steps: [t0, nextStep(t0)], props: [{ kind: 'cone', at: { x: 0.2, y: 0.3 } }], folder: 'Presse', updatedAt: '2026-08-01T10:00:00.000Z' }
}

describe('encode / decode', () => {
  it('returns an equivalent play after a round trip', async () => {
    const s = full()
    const recu = await decode(await encode(s))
    expect(recu).not.toBeNull()
    expect(recu!.name).toBe(s.name)
    expect(recu!.note).toBe(s.note)
    expect(recu!.court).toBe(s.court)
    expect(recu!.defense).toBe(s.defense)
    expect(recu!.steps).toEqual(s.steps)
    expect(recu!.props).toEqual(s.props)
  })

  it('strips what makes no sense elsewhere', async () => {
    const recu = (await decode(await encode(full())))!
    expect(recu.id).toBe('')
    expect(recu.clubId).toBe('')
    expect(recu.updatedAt).toBeUndefined()
    expect(recu.folder).toBeUndefined()
  })

  it('produces a code with no character needing escaping in a URL', async () => {
    const code = await encode(full())
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(code)).toBe(code)
  })

  it('stays well under the limit for an ordinary play', async () => {
    expect((await encode(full())).length).toBeLessThan(LINK_LIMIT / 4)
  })

  it('returns null on an empty or truncated code, or one that is not a play', async () => {
    expect(await decode('')).toBeNull()
    expect(await decode('pas-du-tout-un-code')).toBeNull()
    const code = await encode(full())
    expect(await decode(code.slice(0, Math.floor(code.length / 2)))).toBeNull()
  })

  it('returns null when the decompressed content does not have a play\'s shape', async () => {
    // Valid JSON that is not a play: the validation is about the shape, not only
    // about the decompression.
    expect(await decode(await encodeRaw({ bonjour: 'monde' }))).toBeNull()
  })

  it('refuses a half-valid payload, down to the bottom of the arrays', async () => {
    // This is the one boundary through which data from elsewhere enters the
    // application. Stopping at the containers would let these payloads through, and
    // rendering would throw on a marker with no position — with no error boundary to
    // catch it, React unmounts everything and you get the blank screen this decoder
    // exists precisely to prevent.
    const good = await transportDe(full())
    const corrupt = (f: (t: Brut) => void) => {
      const t: Brut = JSON.parse(JSON.stringify(good)); f(t); return encodeRaw(t)
    }

    // A marker with no position: `PlayBoard` would read `at.x` on `undefined`.
    expect(await decode(await corrupt((t) => { delete t.steps[0].markers[0].at }))).toBeNull()
    // A position that is not a finite number: `NaN` gets through `typeof`.
    expect(await decode(await corrupt((t) => { t.steps[0].markers[0].at.x = null }))).toBeNull()
    // A prop placed with no position.
    expect(await decode(await corrupt((t) => { delete t.props[0].at }))).toBeNull()
    // A ball that is neither carried nor placed.
    expect(await decode(await corrupt((t) => { t.steps[0].ball = {} }))).toBeNull()
    // An arrow with no usable stroke.
    expect(await decode(await corrupt((t) => { t.steps[0].arrows[0].points = [{ x: 0.1, y: 0.1 }] }))).toBeNull()
    // A position outside the five.
    expect(await decode(await corrupt((t) => { t.steps[0].markers[0].position = 9 }))).toBeNull()

    // The control: the same payload, intact, passes. Without it, a validator that
    // refused everything would make this test pass for the wrong reason.
    expect(await decode(await encodeRaw(good))).not.toBeNull()
  })
})

/** A test payload, deliberately untyped: these tests exist precisely to build
 *  structures that do not respect the model. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Brut = any

/** Compresses and encodes anything the way `encode` would, in order to build
 *  deliberately damaged payloads. `Blob.stream()` does not exist in jsdom. */
async function encodeRaw(v: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(v))
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({ start(c) { c.enqueue(bytes); c.close() } })
  const stream = source.pipeThrough(new CompressionStream('deflate-raw'))
  const raw = new Uint8Array(await new Response(stream).arrayBuffer())
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** What `encode` actually puts in the link, read back by `decode`. */
async function transportDe(s: Play): Promise<Record<string, unknown>> {
  const recu = (await decode(await encode(s)))!
  const { id: _id, clubId: _clubId, ...reste } = recu
  return reste as unknown as Record<string, unknown>
}
