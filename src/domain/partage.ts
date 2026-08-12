/**
 * Le lien porte le schéma. Une combinaison compressée tient dans une URL : pas
 * de serveur, pas de compte, pas de base partagée, et le lien ne périme jamais.
 * Le code se pose dans le **fragment** (`#…`), qui n'est envoyé à aucun serveur
 * et n'atterrit dans aucun journal d'accès.
 *
 * La compression est celle de la plateforme — `CompressionStream('deflate-raw')`,
 * présent partout depuis 2023 —, donc aucune dépendance.
 */
import type { ObjetPose, Schema, Temps, Terrain } from './plays'

/** Au-delà, une URL devient fragile dans les messageries : mieux vaut proposer
 *  l'image ou le PDF qu'un lien qui se tronquerait en silence. */
export const LIMITE_LIEN = 8000

/** Ce qui voyage. `id`, `clubId`, `majLe` et `dossier` restent chez l'expéditeur :
 *  un schéma reçu est un schéma neuf, il ne peut donc écraser personne. */
interface Transport {
  nom: string
  note?: string
  terrain: Terrain
  defense: boolean
  objets: ObjetPose[]
  temps: Temps[]
}

const versB64url = (octets: Uint8Array) =>
  btoa(Array.from(octets, (o) => String.fromCharCode(o)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const depuisB64url = (code: string) => {
  const binaire = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0))
}

/** Les octets en flux d'une seule bouchée. On passe par `ReadableStream` plutôt
 *  que par `Blob.stream()` : jsdom n'implémente pas le second, et les tests du
 *  domaine ne doivent pas dépendre de ce que le navigateur a de plus que lui. */
const enFlux = (octets: Uint8Array<ArrayBuffer>) => new ReadableStream<Uint8Array<ArrayBuffer>>({
  start(c) { c.enqueue(octets); c.close() },
})

/** Le schéma compressé et encodé, prêt à mettre après le `#` d'une URL. */
export async function encoder(s: Schema): Promise<string> {
  const utile: Transport = {
    nom: s.nom, note: s.note, terrain: s.terrain, defense: s.defense, objets: s.objets, temps: s.temps,
  }
  const octets = new TextEncoder().encode(JSON.stringify(utile))
  const flux = enFlux(octets).pipeThrough(new CompressionStream('deflate-raw'))
  return versB64url(new Uint8Array(await new Response(flux).arrayBuffer()))
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * La forme, vraiment vérifiée. Un lien tronqué, retouché à la main ou produit
 * par une version future décompresse parfois en un objet à moitié valide ; le
 * laisser passer donnerait un écran qui plante loin d'ici, sur un `temps[0]`
 * absent. Ce qui n'a pas cette forme n'est pas un schéma.
 */
function estTransport(v: unknown): v is Transport {
  if (!estObjet(v)) return false
  if (typeof v.nom !== 'string') return false
  if (v.terrain !== 'demi' && v.terrain !== 'complet') return false
  if (!Array.isArray(v.objets)) return false
  if (!Array.isArray(v.temps) || v.temps.length === 0) return false
  return v.temps.every((t) => estObjet(t) && Array.isArray(t.pions) && estObjet(t.ballon) && Array.isArray(t.fleches))
}

/** L'inverse. Rend `null` sur un texte qui n'est pas un schéma valide. */
export async function decoder(code: string): Promise<Schema | null> {
  if (!code) return null
  try {
    const flux = enFlux(depuisB64url(code)).pipeThrough(new DecompressionStream('deflate-raw'))
    const lu: unknown = JSON.parse(await new Response(flux).text())
    if (!estTransport(lu)) return null
    // Les champs absents du transport reviennent à leur valeur neutre : sans
    // identifiant ni club, le schéma reçu est neuf.
    return { id: '', clubId: '', ...lu, defense: !!lu.defense }
  } catch {
    return null
  }
}
