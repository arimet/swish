import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fr } from './fr'
import { en } from './en'
import { traducteur } from './index'

/**
 * Le garde-fou de la traduction.
 *
 * Le défaut que ce fichier attrape n'est pas rattrapable autrement : une clef écrite
 * dans un composant mais absente du catalogue **compile**, passe le typage, et
 * s'affiche telle quelle à l'écran — « nav.calendrier » en toutes lettres dans la
 * barre de navigation. C'est arrivé pendant la migration de la coquille, entre deux
 * étapes, sans qu'aucun outil ne bronche.
 *
 * On relit donc les sources et on confronte les clefs employées au catalogue français,
 * qui fait référence.
 */

const RACINES = ['src/ui', 'src/app', 'src/i18n', 'src/components']

function sources(): string[] {
  const out: string[] = []
  const descendre = (dir: string) => {
    for (const nom of readdirSync(dir)) {
      const chemin = join(dir, nom)
      if (statSync(chemin).isDirectory()) descendre(chemin)
      else if (/\.tsx?$/.test(nom) && !nom.includes('.test.')) out.push(chemin)
    }
  }
  for (const r of RACINES) descendre(r)
  return out
}

/**
 * Toute chaîne littérale **en forme de clef** trouvée dans les sources.
 *
 * La première version ne lisait que `t('…')`, et une mutation l'a prise en défaut :
 * les libellés de navigation et les titres de page sont des clefs rangées dans des
 * tableaux au niveau du module — `{ label: 'nav.calendrier' }` — puis traduits au
 * rendu. Une faute de frappe y passait sans être vue, ce qui est exactement le cas
 * qu'on cherche à couvrir.
 *
 * On repère donc les clefs à leur **forme** : une famille connue du catalogue, un
 * point, un nom. Les familles se déduisent du catalogue lui-même, donc en ajouter une
 * n'oblige à rien ici.
 *
 * Les clefs calculées (`t(\`role.${r}\`)`) restent hors de portée d'une lecture de
 * texte ; elles ont leur propre test, plus bas.
 */
function clefsEmployees(): Map<string, string[]> {
  const familles = [...new Set(Object.keys(fr).map((k) => k.split('.')[0]))]
  const motif = new RegExp(`['\`](${familles.join('|')})\\.([A-Za-z][\\w]*)['\`]`, 'g')
  const par = new Map<string, string[]>()
  for (const f of sources()) {
    if (f.startsWith('src/i18n/')) continue // le catalogue se définit lui-même
    for (const m of readFileSync(f, 'utf8').matchAll(motif)) {
      const clef = `${m[1]}.${m[2]}`
      par.set(clef, [...(par.get(clef) ?? []), f])
    }
  }
  return par
}

describe('catalogue de traduction', () => {
  it('toute clef employée dans le code existe en français', () => {
    const manquantes = [...clefsEmployees()]
      .filter(([clef]) => !(clef in fr) && !(`${clef}_un` in fr))
      .map(([clef, fichiers]) => `${clef} (${fichiers.join(', ')})`)
    expect(manquantes, 'clefs sans traduction française').toEqual([])
  })

  it('les familles calculées sont complètes', () => {
    // Ces clefs se construisent à l'exécution (`t(\`role.${role}\`)`) : le test ne peut
    // pas les lire dans les sources, donc il énumère les valeurs possibles du domaine.
    for (const role of ['visiteur', 'marque', 'admin']) expect(fr).toHaveProperty(`role.${role}`)
  })

  it('l’anglais ne retombe jamais sur la clef elle-même', () => {
    // Le repli est le français, par choix : un écran à moitié traduit reste utilisable,
    // un écran semé d'identifiants ne l'est pas. On vérifie donc que *traduire* en
    // anglais ne rend jamais la clef brute, y compris pour ce que l'anglais n'a pas.
    const t = traducteur('en')
    const brutes = Object.keys(fr).filter((clef) => t(clef) === clef && fr[clef] !== clef)
    expect(brutes, 'clefs rendues telles quelles en anglais').toEqual([])
  })

  it('l’anglais ne contient pas de clef inconnue du français', () => {
    // L'inverse est permis — l'anglais peut être en retard — mais une clef anglaise
    // sans équivalent français est une faute de frappe ou un reliquat.
    expect(Object.keys(en).filter((clef) => !(clef in fr))).toEqual([])
  })

  it('les paramètres d’un modèle existent dans les deux langues', () => {
    // « {role} » traduit sans son paramètre laisserait l'accolade à l'écran.
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    const divergents = Object.keys(en)
      .filter((clef) => clef in fr && params(en[clef]) !== params(fr[clef]))
      .map((clef) => `${clef} : fr(${params(fr[clef])}) ≠ en(${params(en[clef])})`)
    expect(divergents).toEqual([])
  })

  it('interpole et accorde le pluriel dans les deux langues', () => {
    expect(traducteur('fr')('commun.joueur', { count: 1 })).toBe('1 joueur')
    expect(traducteur('fr')('commun.joueur', { count: 3 })).toBe('3 joueurs')
    expect(traducteur('en')('commun.joueur', { count: 1 })).toBe('1 player')
    expect(traducteur('en')('commun.joueur', { count: 3 })).toBe('3 players')
  })
})
