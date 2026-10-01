import { LANGS, useLang, useT } from './index'
import { BTN_BASE, SECONDARY } from '../ui/components/buttons'

/**
 * The language switcher, twin of the theme switcher and placed next to it.
 *
 * Two languages only, so a **toggle** and not a dropdown: a menu to choose between
 * two values asks for two gestures where one is enough. The button shows the
 * **current** language's code — that is what a language tab does everywhere else,
 * and that is what the eye looks for to know where it is. Its accessible name, on
 * the other hand, announces the language it leads to, otherwise a screen reader
 * would announce the state without saying what the button does.
 *
 * The label stays a two-letter capital to fit the same 36px circle as the theme: a
 * flag would have been shorter still, but a flag designates a country and not a
 * language — and neither French nor English has only one.
 */
export function LangSwitcher() {
  const { lang, setLang } = useLang()
  const translate = useT()
  const next = LANGS[(LANGS.findIndex((l) => l.code === lang) + 1) % LANGS.length]
  return (
    <button
      onClick={() => setLang(next.code)}
      aria-label={`${translate('lang.switch')} — ${next.name}`}
      title={next.name}
      className={`${BTN_BASE} h-9 w-9 text-[12px] font-black uppercase tracking-tight ${SECONDARY}`}
    >
      {lang}
    </button>
  )
}
