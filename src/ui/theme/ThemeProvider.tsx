import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light', setTheme: () => {},
})
export const useTheme = () => useContext(ThemeContext)

/** La clé du choix enregistré. Le script en tête d'`index.html` lit la même :
 *  c'est lui qui pose le thème avant la première peinture, pour qu'un appareil
 *  réglé en sombre ne voie pas d'éclair blanc. */
export const THEME_KEY = 'swish-theme'

/** Choix enregistré s'il y en a un, sombre sinon.
 *
 *  Le sombre n'est pas ici un mode d'économie mais l'identité du produit : le
 *  canevas encre est ce qui autorise l'accent citron à être vif, aucune couleur
 *  n'ayant plus à se défendre contre du blanc. Un premier lancement doit donc
 *  montrer le produit tel qu'il est pensé.
 *
 *  La préférence système n'est **pas** consultée, et c'est le seul endroit du
 *  dépôt où l'on s'autorise à passer outre. Le thème clair existe, il est composé
 *  et non hérité, et la bascule est dans l'en-tête de chaque écran : qui le
 *  préfère l'obtient d'un clic, et son choix est mémorisé pour toujours. */
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
