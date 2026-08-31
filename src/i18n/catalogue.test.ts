import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fr } from './fr'
import { en } from './en'
import { translator } from './index'

/**
 * The translation's guard rail.
 *
 * Nothing else catches this: a key written in a component but absent from the
 * catalogue **compiles**, passes type checking, and shows on screen as it is —
 * "nav.calendar" spelled out in the navigation bar, with not one tool blinking.
 *
 * So we read the sources back and confront the keys they use with the French
 * catalogue, which is the reference.
 */

const ROOTS = ['src/ui', 'src/app', 'src/i18n', 'src/components']

function sources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !name.includes('.test.')) out.push(path)
    }
  }
  for (const r of ROOTS) walk(r)
  return out
}

/**
 * Every string literal **shaped like a key** found in the sources.
 *
 * Reading `t('…')` alone is not enough: the navigation labels and the page titles are
 * keys filed in module-level arrays — `{ label: 'nav.calendar' }` — and translated at
 * render time, so a typo there would go through unseen. That is exactly the case to
 * cover.
 *
 * So keys are recognised by their **shape**: a family known to the catalogue, a dot, a
 * name. The families are derived from the catalogue itself, so adding one asks nothing
 * of this file.
 *
 * Computed keys (`t(\`role.${r}\`)`) stay out of reach of a textual read; they have
 * their own test, further down.
 */
function keysUsed(): Map<string, string[]> {
  const families = [...new Set(Object.keys(fr).map((k) => k.split('.')[0]))]
  const pattern = new RegExp(`['\`](${families.join('|')})\\.([A-Za-z][\\w]*)['\`]`, 'g')
  const byKey = new Map<string, string[]>()
  for (const f of sources()) {
    // The two catalogues define themselves; every other file under `src/i18n` is an
    // ordinary component and must be read. Excluding the whole folder is how
    // `LangSwitcher`'s missing `lang.switch` went unnoticed: its aria-label announced
    // the key itself to screen readers.
    if (f === join('src/i18n', 'fr.ts') || f === join('src/i18n', 'en.ts')) continue
    for (const m of readFileSync(f, 'utf8').matchAll(pattern)) {
      const key = `${m[1]}.${m[2]}`
      byKey.set(key, [...(byKey.get(key) ?? []), f])
    }
  }
  return byKey
}

describe('the translation catalogue', () => {
  it('every key used in the code exists in French', () => {
    const missing = [...keysUsed()]
      .filter(([key]) => !(key in fr) && !(`${key}_one` in fr))
      .map(([key, files]) => `${key} (${files.join(', ')})`)
    expect(missing, 'keys with no French translation').toEqual([])
  })

  it('the computed families are complete', () => {
    // These keys are built at run time (`t(\`role.${role}\`)`): the test cannot read
    // them from the sources, so it enumerates the domain's possible values.
    for (const role of ['visitor', 'scorer', 'admin']) expect(fr).toHaveProperty(`role.${role}`)
  })

  it('English never falls back to the key itself', () => {
    // The fallback is French, by choice: a half-translated screen is still usable, a
    // screen strewn with identifiers is not. So we check that *translating* into
    // English never returns the raw key, including for what English does not have.
    const t = translator('en')
    const raw = Object.keys(fr).filter((key) => t(key) === key && fr[key] !== key)
    expect(raw, 'keys rendered as-is in English').toEqual([])
  })

  it('English holds no key unknown to French', () => {
    // The converse is allowed — English may lag — but an English key with no French
    // counterpart is a typo or a leftover.
    expect(Object.keys(en).filter((key) => !(key in fr))).toEqual([])
  })

  it('a template\'s parameters exist in both languages', () => {
    // "{role}" translated without its parameter would leave the brace on screen.
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    const divergent = Object.keys(en)
      .filter((key) => key in fr && params(en[key]) !== params(fr[key]))
      .map((key) => `${key} : fr(${params(fr[key])}) ≠ en(${params(en[key])})`)
    expect(divergent).toEqual([])
  })

  it('interpolates and agrees the plural in both languages', () => {
    expect(translator('fr')('common.player', { count: 1 })).toBe('1 joueur')
    expect(translator('fr')('common.player', { count: 3 })).toBe('3 joueurs')
    expect(translator('en')('common.player', { count: 1 })).toBe('1 player')
    expect(translator('en')('common.player', { count: 3 })).toBe('3 players')
  })
})
