import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light', setTheme: () => {},
})
export const useTheme = () => useContext(ThemeContext)

/**
 * Le clair, toujours, au démarrage — et c'est aussi ce que les jetons CSS posent
 * sur `:root` nu, donc pas de clignotement au chargement.
 *
 * On ne relit **pas** de préférence enregistrée, et c'est délibéré : aucun écran
 * n'expose de bascule aujourd'hui. Un `theme: dark` laissé dans un navigateur
 * par une version précédente enfermait donc son propriétaire dans un thème dont
 * rien ne permettait de sortir. Tant que le choix n'est pas offert, il ne se
 * mémorise pas.
 *
 * Le sombre reste complet et `setTheme` fonctionne : le jour où l'on posera un
 * `ThemeSwitcher`, c'est ici qu'on relira ce qu'il aura écrit.
 */
const initialTheme = (): Theme => 'light'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.classList.toggle('dark', theme === 'dark')
    // Rien n'est enregistré : sans bascule à l'écran, une préférence mémorisée ne
    // pourrait que piéger. Voir `initialTheme`.
    localStorage.removeItem('theme')
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
