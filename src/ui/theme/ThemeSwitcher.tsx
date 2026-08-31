import { useTheme } from './ThemeProvider'
import { useT } from '../../i18n'

/** The theme toggle, twin of the language switcher and placed next to it. Two
 *  themes, so a toggle: the icon shows what the click leads *to*, and the
 *  accessible name says it in words. Both labels come from the catalogue: a
 *  hard-coded string here is one the translation can never reach. */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const translate = useT()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={translate(isDark ? 'theme.switchToLight' : 'theme.switchToDark')}
      title={translate(isDark ? 'theme.light' : 'theme.dark')}
      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted active:scale-95"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
