import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fr } from './fr'
import { en } from './en'

/**
 * The application's two languages.
 *
 * **French is the product's language** and will stay so: the users are a French
 * club, all the vocabulary is the FFBB's, and English is not a "default"
 * translation someone neglected to write. It is added so that other teams can fork
 * the project and use it — that is the goal the README announces, and it would be
 * hollow if the interface stayed monolingual.
 *
 * Direct consequence on the fallback: a key missing from English falls back to
 * **French**, never to the key itself. A half-translated screen is still a screen
 * you can use; a screen strewn with raw dotted identifiers is not.
 */
export type Lang = 'fr' | 'en'

export const LANGS: { code: Lang; name: string }[] = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
]

const CATALOGS: Record<Lang, Record<string, string>> = { fr, en }

/** Remembered on the device, like the theme — and for the same reason: we do not
 *  ask someone for their language at every opening. */
export const LANG_KEY = 'swish-lang'

const isLang = (v: string | null): v is Lang => v === 'fr' || v === 'en'

/**
 * The language at first render: the remembered choice, otherwise **French**.
 *
 * The browser's language is deliberately not consulted, although that is the
 * convention. French is the product's language and not one localisation among
 * others; following `navigator.language` would open Swish in English for the club
 * it is meant for, as soon as the scorer's laptop is set to English — which
 * happens. English exists for whoever asks, and the switcher is in every screen's
 * header. This is the same reasoning as the theme, which ignores
 * `prefers-color-scheme` for the same reason: a product identity is not a system
 * preference.
 */
export function initialLang(): Lang {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY)
  return isLang(stored) ? stored : 'fr'
}

/**
 * The current language, readable outside React.
 *
 * The date formatters (the kit's `fmtDate`, the calendar's month bar) are ordinary
 * functions called in eight files, often from sub-components that have no hook.
 * Making them take the language as a parameter would mean adding `useLang()` in a
 * dozen places for a value that is, itself, frankly global — it is the same for the
 * whole screen, always.
 *
 * The field is written **before** the switcher's `setState`: by the time React
 * re-renders, it already carries the new language, and that render crosses the
 * whole tree since the provider is at the root. No screen can therefore display a
 * date in the previous language.
 */
let current: Lang = 'fr'
export const currentLang = (): Lang => current

/**
 * Replaces a template's `{name}` parameters.
 *
 * Plurals go through two keys suffixed `_one` / `_other` rather than through a
 * library: the project's two languages share the same simple rule (one against the
 * rest), and zero follows the plural in both cases — "0 joueur" is a French special
 * case, handled by the catalogue where it matters, not by a general rule.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, key) => {
    const v = params[key]
    return v === undefined ? whole : String(v)
  })
}

export type Translate = (key: string, params?: Record<string, string | number>) => string

/** Builds a language's translation function. Exported separately for the rare
 *  callers outside a component (the domain's rule messages, tests). */
export function translator(lang: Lang): Translate {
  const catalog = CATALOGS[lang] ?? fr
  return (key, params) => {
    const count = params?.count
    if (typeof count === 'number') {
      // Zero does not agree the same way in both languages: French puts it in the
      // singular ("0 joueur"), English in the plural ("0 players"). It is the only
      // divergence between their rules, and it shows — an empty roster and a game
      // with nobody called up both display a zero.
      const suffix = count === 1 || (lang === 'fr' && count === 0) ? '_one' : '_other'
      const template = catalog[key + suffix] ?? fr[key + suffix]
      if (template) return interpolate(template, params)
    }
    // Fall back to French, never to the key: see the file header.
    return interpolate(catalog[key] ?? fr[key] ?? key, params)
  }
}

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translate
}

/* The default value is not `null`, unlike the authentication context, which throws
   outside its provider. The difference is deliberate: "what is my role" has no
   sensible answer out of context, whereas "in which language" always has one. A
   component rendered without a provider — the case of the fifty-odd test files that
   mount a screen in isolation — therefore speaks French instead of crashing. */
const Ctx = createContext<Ctx>({ lang: 'fr', setLang: () => {}, t: translator('fr') })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (current = initialLang()))

  // The document's `lang` attribute follows the choice. This is not decorative: it
  // decides hyphenation, quotation marks, a screen reader's voice and the automatic
  // translation the browser offers. The document was born `lang="en"` while all its
  // content was French.
  useEffect(() => {
    document.documentElement.lang = lang
    // The tab title follows too: `index.html` can only carry one, and it would stay
    // French in an application switched to English.
    document.title = translator(lang)('app.title')
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l)
    current = l
    setLangState(l)
  }, [])

  const value = useMemo(() => ({ lang, setLang, t: translator(lang) }), [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * The current component's translation function.
 *
 * By convention it is assigned to `translate` and not to `t`, although `t` is the
 * ecosystem's usage. The reason is concrete: `t` is already taken some fifteen
 * times in this repo as a parameter name — `teams.map((t) => …)`,
 * `trainings.filter((t) => …)`, `const t = teamTotals(match).team`. TypeScript does
 * report the collision, but reporting it fifteen times for one character saved is a
 * bad trade.
 */
export function useT(): Translate {
  return useContext(Ctx).t
}

/** The current language and the means to change it — for the switcher, and only it. */
export function useLang() {
  const { lang, setLang } = useContext(Ctx)
  return { lang, setLang }
}
