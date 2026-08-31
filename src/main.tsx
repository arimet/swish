import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/theme/ThemeProvider'
import { LangProvider } from './i18n'

// Base UI only unmounts its popups (Dialog, Select…) after waiting for a
// requestAnimationFrame and then for the CSS exit animations to finish. In a tab that
// does not paint (a background tab, a preview pane, a throttled webview), neither the
// frame nor the animation timeline advances: the dialog stays mounted indefinitely
// with its modal veil, and the screen becomes unusable.
// This public Base UI flag short-circuits that wait and unmounts immediately. We lose
// the exit animation, we gain dialogs that always close.
// No test: jsdom implements neither `Element.getAnimations` nor CSS animations, so
// Base UI takes its short-circuit there from the start and always unmounts. The defect
// is structurally invisible under test; it only shows in a browser, in a tab that does
// not paint. A test would have to fake both `getAnimations` and a rAF that never
// fires: it would pass with or without this line, so it would prove nothing.
// (the cast avoids depending on the package's global augmentation, which our tsconfig
// does not load)
;(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true

/**
 * Earlier versions shipped a service worker to make the application work offline.
 * Offline is gone — the database is the only source of truth — but a worker
 * registered on someone's phone stays registered, and would keep serving that old
 * cached shell forever, against a database it no longer understands. So we
 * un-register whatever is left, once, on the way in.
 *
 * Removable in a season or two, when no device is still carrying one.
 */
async function dropServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
  } catch { /* private browsing, or no permission: there is nothing to clean up then */ }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <App />
      </LangProvider>
    </ThemeProvider>
  </StrictMode>,
)

/* The screens fetch what they need; nothing here blocks the first paint on a network
   round trip. A database that does not answer must show its screens and say so
   (see `ConnectionState`), not hang on a white page. */
void dropServiceWorkers()

// Demo data: in dev, or in production if VITE_SEED=1. It only ever fills an empty
// database — see `seedDevData`.
if (import.meta.env.DEV || import.meta.env.VITE_SEED === '1') {
  void import('./dev/seed').then(({ seedDevData }) => seedDevData()).catch((e) => {
    console.error('[swish] demo data not seeded:', (e as Error).message,
      '— is DATABASE_URL set, and the write token entered under Administration?')
  })
}
