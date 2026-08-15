import { describe, expect, it } from 'vitest'
import { encoder, decoder, LIMITE_LIEN } from './partage'
import { newPlay, nextStep, type Play } from './plays'

const full = (): Play => {
  const s: Play = { id: 'x1', ...newPlay('club-a', 'full', true), nom: 'Presse tout terrain', note: 'Sortie de balle' }
  const t0 = { ...s.temps[0], arrows: [{ from: { side: 'offense' as const, position: 1 as const }, stroke: 'dribble' as const, points: [{ x: 0.5, y: 0.4 }, { x: 0.3, y: 0.25 }] }] }
  return { ...s, temps: [t0, nextStep(t0)], props: [{ kind: 'cone', at: { x: 0.2, y: 0.3 } }], folder: 'Presse', updatedAt: '2026-08-01T10:00:00.000Z' }
}

describe('encoder / decoder', () => {
  it('rend un schéma équivalent après un aller-retour', async () => {
    const s = full()
    const recu = await decoder(await encoder(s))
    expect(recu).not.toBeNull()
    expect(recu!.nom).toBe(s.nom)
    expect(recu!.note).toBe(s.note)
    expect(recu!.court).toBe(s.court)
    expect(recu!.defense).toBe(s.defense)
    expect(recu!.temps).toEqual(s.temps)
    expect(recu!.props).toEqual(s.props)
  })

  it('retire ce qui n’a pas de sens ailleurs', async () => {
    const recu = (await decoder(await encoder(full())))!
    expect(recu.id).toBe('')
    expect(recu.clubId).toBe('')
    expect(recu.updatedAt).toBeUndefined()
    expect(recu.folder).toBeUndefined()
  })

  it('produit un code sans caractère à échapper dans une URL', async () => {
    const code = await encoder(full())
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(code)).toBe(code)
  })

  it('reste très en deçà de la limite pour un schéma ordinaire', async () => {
    expect((await encoder(full())).length).toBeLessThan(LIMITE_LIEN / 4)
  })

  it('rend null sur un code vide, tronqué, ou qui n’est pas un schéma', async () => {
    expect(await decoder('')).toBeNull()
    expect(await decoder('pas-du-tout-un-code')).toBeNull()
    const code = await encoder(full())
    expect(await decoder(code.slice(0, Math.floor(code.length / 2)))).toBeNull()
  })

  it('rend null quand le contenu décompressé n’a pas la forme d’un schéma', async () => {
    // Un JSON valide mais qui n'est pas un schéma : la validation porte sur la
    // forme, pas seulement sur la décompression.
    expect(await decoder(await coder({ bonjour: 'monde' }))).toBeNull()
  })

  it('refuse une charge à moitié valide, jusqu’au fond des tableaux', async () => {
    // C'est la seule frontière par laquelle des données venues d'ailleurs entrent
    // dans l'application. S'arrêter aux conteneurs laisserait passer ces charges,
    // et le rendu lèverait sur un pion sans position — sans limite d'erreur pour
    // rattraper, React démonte tout et l'on obtient l'écran blanc que ce décodeur
    // existe précisément pour éviter.
    const bon = await transportDe(full())
    const abime = (f: (t: Brut) => void) => {
      const t: Brut = JSON.parse(JSON.stringify(bon)); f(t); return coder(t)
    }

    // Un pion sans position : `PlayBoard` lirait `at.x` sur `undefined`.
    expect(await decoder(await abime((t) => { delete t.temps[0].markers[0].at }))).toBeNull()
    // Une position qui n'est pas un nombre fini : `NaN` traverse `typeof`.
    expect(await decoder(await abime((t) => { t.temps[0].markers[0].at.x = null }))).toBeNull()
    // Un objet posé sans position.
    expect(await decoder(await abime((t) => { delete t.props[0].at }))).toBeNull()
    // Un ballon qui n'est ni porté ni posé.
    expect(await decoder(await abime((t) => { t.temps[0].ball = {} }))).toBeNull()
    // Une flèche sans tracé exploitable.
    expect(await decoder(await abime((t) => { t.temps[0].arrows[0].points = [{ x: 0.1, y: 0.1 }] }))).toBeNull()
    // Un poste hors de l'effectif.
    expect(await decoder(await abime((t) => { t.temps[0].markers[0].position = 9 }))).toBeNull()

    // Le témoin : la même charge, intacte, passe. Sans lui, un `estTransport`
    // qui refuserait tout ferait passer ce test pour la mauvaise raison.
    expect(await decoder(await coder(bon))).not.toBeNull()
  })
})

/** Une charge d'essai, volontairement sans type : ces tests fabriquent justement
 *  des structures qui ne respectent pas le modèle, c'est tout leur objet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Brut = any

/** Compresse et encode n'importe quoi comme le ferait `encoder`, pour fabriquer
 *  des charges volontairement abîmées. `Blob.stream()` n'existe pas en jsdom. */
async function coder(v: unknown): Promise<string> {
  const octets = new TextEncoder().encode(JSON.stringify(v))
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({ start(c) { c.enqueue(octets); c.close() } })
  const stream = source.pipeThrough(new CompressionStream('deflate-raw'))
  const brut = new Uint8Array(await new Response(stream).arrayBuffer())
  return btoa(String.fromCharCode(...brut)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Ce que `encoder` met réellement dans le lien, relu par `decoder`. */
async function transportDe(s: Play): Promise<Record<string, unknown>> {
  const recu = (await decoder(await encoder(s)))!
  const { id: _id, clubId: _clubId, ...reste } = recu
  return reste as unknown as Record<string, unknown>
}
