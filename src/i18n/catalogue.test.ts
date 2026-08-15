import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fr } from './fr'
import { en } from './en'
import { translator } from './index'

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
    for (const name of readdirSync(dir)) {
      const chemin = join(dir, name)
      if (statSync(chemin).isDirectory()) descendre(chemin)
      else if (/\.tsx?$/.test(name) && !name.includes('.test.')) out.push(chemin)
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
    // The two catalogues define themselves; every other file under `src/i18n` is an
    // ordinary component and must be read. Excluding the whole folder is how
    // `LangSwitcher`'s missing `lang.switch` went unnoticed: its aria-label announced
    // the key itself to screen readers.
    if (f === join('src/i18n', 'fr.ts') || f === join('src/i18n', 'en.ts')) continue
    for (const m of readFileSync(f, 'utf8').matchAll(motif)) {
      const key = `${m[1]}.${m[2]}`
      par.set(key, [...(par.get(key) ?? []), f])
    }
  }
  return par
}

describe('the translation catalogue', () => {
  it('every key used in the code exists in French', () => {
    const manquantes = [...clefsEmployees()]
      .filter(([key]) => !(key in fr) && !(`${key}_one` in fr))
      .map(([key, fichiers]) => `${key} (${fichiers.join(', ')})`)
    expect(manquantes, 'clefs sans traduction française').toEqual([])
  })

  it('the computed families are complete', () => {
    // Ces clefs se construisent à l'exécution (`t(\`role.${role}\`)`) : le test ne peut
    // pas les lire dans les sources, donc il énumère les valeurs possibles du domaine.
    for (const role of ['visitor', 'scorer', 'admin']) expect(fr).toHaveProperty(`role.${role}`)
  })

  it('English never falls back to the key itself', () => {
    // Le repli est le français, par choix : un écran à moitié traduit reste utilisable,
    // un écran semé d'identifiants ne l'est pas. On vérifie donc que *traduire* en
    // anglais ne rend jamais la clef brute, y compris pour ce que l'anglais n'a pas.
    const t = translator('en')
    const brutes = Object.keys(fr).filter((key) => t(key) === key && fr[key] !== key)
    expect(brutes, 'clefs rendues telles quelles en anglais').toEqual([])
  })

  it('English holds no key unknown to French', () => {
    // L'inverse est permis — l'anglais peut être en retard — mais une clef anglaise
    // sans équivalent français est une faute de frappe ou un reliquat.
    expect(Object.keys(en).filter((key) => !(key in fr))).toEqual([])
  })

  it('a template\'s parameters exist in both languages', () => {
    // « {role} » traduit sans son paramètre laisserait l'accolade à l'écran.
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    const divergents = Object.keys(en)
      .filter((key) => key in fr && params(en[key]) !== params(fr[key]))
      .map((key) => `${key} : fr(${params(fr[key])}) ≠ en(${params(en[key])})`)
    expect(divergents).toEqual([])
  })

  it('interpolates and agrees the plural in both languages', () => {
    expect(translator('fr')('commun.joueur', { count: 1 })).toBe('1 joueur')
    expect(translator('fr')('commun.joueur', { count: 3 })).toBe('3 joueurs')
    expect(translator('en')('commun.joueur', { count: 1 })).toBe('1 player')
    expect(translator('en')('commun.joueur', { count: 3 })).toBe('3 players')
  })
})
