import { describe, expect, it } from 'vitest'
import { encoder, decoder, LIMITE_LIEN } from './partage'
import { nouveauSchema, tempsSuivant, type Schema } from './plays'

const complet = (): Schema => {
  const s: Schema = { id: 'x1', ...nouveauSchema('club-a', 'complet', true), nom: 'Presse tout terrain', note: 'Sortie de balle' }
  const t0 = { ...s.temps[0], fleches: [{ depuis: { camp: 'attaque' as const, poste: 1 as const }, trait: 'dribble' as const, points: [{ x: 0.5, y: 0.4 }, { x: 0.3, y: 0.25 }] }] }
  return { ...s, temps: [t0, tempsSuivant(t0)], objets: [{ sorte: 'plot', at: { x: 0.2, y: 0.3 } }], dossier: 'Presse', majLe: '2026-08-01T10:00:00.000Z' }
}

describe('encoder / decoder', () => {
  it('rend un schéma équivalent après un aller-retour', async () => {
    const s = complet()
    const recu = await decoder(await encoder(s))
    expect(recu).not.toBeNull()
    expect(recu!.nom).toBe(s.nom)
    expect(recu!.note).toBe(s.note)
    expect(recu!.terrain).toBe(s.terrain)
    expect(recu!.defense).toBe(s.defense)
    expect(recu!.temps).toEqual(s.temps)
    expect(recu!.objets).toEqual(s.objets)
  })

  it('retire ce qui n’a pas de sens ailleurs', async () => {
    const recu = (await decoder(await encoder(complet())))!
    expect(recu.id).toBe('')
    expect(recu.clubId).toBe('')
    expect(recu.majLe).toBeUndefined()
    expect(recu.dossier).toBeUndefined()
  })

  it('produit un code sans caractère à échapper dans une URL', async () => {
    const code = await encoder(complet())
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(code)).toBe(code)
  })

  it('reste très en deçà de la limite pour un schéma ordinaire', async () => {
    expect((await encoder(complet())).length).toBeLessThan(LIMITE_LIEN / 4)
  })

  it('rend null sur un code vide, tronqué, ou qui n’est pas un schéma', async () => {
    expect(await decoder('')).toBeNull()
    expect(await decoder('pas-du-tout-un-code')).toBeNull()
    const code = await encoder(complet())
    expect(await decoder(code.slice(0, Math.floor(code.length / 2)))).toBeNull()
  })

  it('rend null quand le contenu décompressé n’a pas la forme d’un schéma', async () => {
    // Un JSON valide mais qui n'est pas un schéma : la validation porte sur la
    // forme, pas seulement sur la décompression.
    // `Blob.stream()` n'existe pas en jsdom : on fabrique le flux à la main.
    const octets = new TextEncoder().encode(JSON.stringify({ bonjour: 'monde' }))
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({ start(c) { c.enqueue(octets); c.close() } })
    const flux = source.pipeThrough(new CompressionStream('deflate-raw'))
    const brut = new Uint8Array(await new Response(flux).arrayBuffer())
    const b64 = btoa(String.fromCharCode(...brut)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await decoder(b64)).toBeNull()
  })
})
