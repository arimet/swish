import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light', setTheme: () => {},
})
export const useTheme = () => useContext(ThemeContext)

function initialTheme(): Theme {
  // Le clair est le défaut, et c'est aussi ce que les jetons CSS posent sur
  // `:root` nu : l'application est déjà claire avant que cette ligne ne
  // s'exécute, donc pas de clignotement au chargement.
  //
  // Le sombre reste atteignable — il existe, il est complet — mais il ne se
  // choisit nulle part dans l'interface : personne n'a demandé de bascule, et
  // un réglage qu'aucun écran n'expose est un réglage qui pourrit. Il suffit
  // d'un `localStorage.theme = 'dark'` pour l'obtenir, et d'un `ThemeSwitcher`
  // posé quelque part le jour où on le voudra.
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
