import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/theme/ThemeProvider'
import { LangProvider } from './i18n'
import { WriteBridge, makeQueryClient } from './persistence/queries'

/* One client for the whole application, built here because it is infrastructure: the
   reads it caches outlive any screen. `WriteBridge` sits under it and above everything
   else, so an accepted write reaches the cache wherever in the application it came
   from. */
const queryClient = makeQueryClient()

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
    <QueryClientProvider client={queryClient}>
      <WriteBridge />
      <ThemeProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)

/* The screens fetch what they need; nothing here blocks the first paint on a network
   round trip. A database that does not answer must show its screens and say so
   (see `ConnectionState`), not hang on a white page. */
void dropServiceWorkers()
