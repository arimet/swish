import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/theme/ThemeProvider'
import { LangProvider } from './i18n'
import { db } from './persistence/db'
import { remoteEnabled, hydrate, flush } from './persistence/remote'

// Base UI ne démonte ses popups (Dialog, Select…) qu'après avoir attendu un
// requestAnimationFrame puis la fin des animations CSS de sortie. Dans un onglet
// qui ne peint pas (onglet d'arrière-plan, panneau d'aperçu, webview bridée),
// ni la frame ni la timeline d'animation n'avancent : la boîte de dialogue reste
// montée indéfiniment avec son voile modal, et l'écran devient inutilisable.
// Ce drapeau public de Base UI court-circuite cette attente et démonte
// immédiatement. On y perd l'animation de sortie, on y gagne des dialogues
// qui se ferment toujours.
// Pas de test : jsdom n'implémente ni `Element.getAnimations` ni les animations
// CSS, donc Base UI y prend d'emblée son court-circuit et démonte toujours. Le
// défaut est structurellement invisible en test ; il ne se voit qu'au navigateur,
// dans un onglet qui ne peint pas. Un test devrait simuler à la main et
// `getAnimations` et un rAF qui ne se déclenche jamais : il passerait avec ou
// sans cette ligne, donc il ne prouverait rien.
// (le transtypage évite de dépendre de l'augmentation globale du paquet, que
// notre tsconfig ne charge pas)
;(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true

async function bootstrap() {
  // Base partagée : on hydrate d'abord le cache local depuis le serveur.
  if (remoteEnabled()) await hydrate()

  // Données de démo : en dev, ou en prod si VITE_SEED=1. En mode partagé, on ne
  // seed que si le serveur est vide (sinon on écraserait les données partagées).
  const empty = (await db.teams.count()) === 0
  if ((import.meta.env.DEV || import.meta.env.VITE_SEED === '1') && (!remoteEnabled() || empty)) {
    const { seedDevData } = await import('./dev/seed')
    await seedDevData()
  }

  if (remoteEnabled()) flush(0) // pousse le seed / la file en attente

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}

bootstrap()
