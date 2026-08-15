import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light', setTheme: () => {},
})
export const useTheme = () => useContext(ThemeContext)

/** The key of the saved choice. The script at the top of `index.html` reads the
 *  same one: it is what sets the theme before the first paint, so that a device set
 *  to dark sees no white flash. */
export const THEME_KEY = 'swish-theme'

/** The saved choice if there is one, dark otherwise.
 *
 *  Dark is not an economy mode here but the product's identity: the ink canvas is
 *  what lets the lemon accent be vivid, no colour having to defend itself against
 *  white any more. A first launch must therefore show the product as it is
 *  conceived.
 *
 *  The system preference is **not** consulted, and this is the one place in the repo
 *  where we allow ourselves to override it. The light theme exists, it is composed
 *  rather than inherited, and the toggle is in every screen's header: whoever
 *  prefers it gets it in one click, and their choice is remembered forever. */
const initialTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
