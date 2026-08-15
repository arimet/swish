import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/theme/ThemeProvider'
import { LangProvider } from './i18n'
import { db } from './persistence/db'
import { remoteEnabled, hydrate, flush } from './persistence/remote'

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

async function bootstrap() {
  // Shared database: hydrate the local mirror from the server first.
  if (remoteEnabled()) await hydrate()

  // Demo data: in dev, or in prod if VITE_SEED=1. In shared mode we only seed when the
  // server is empty (otherwise we would overwrite the shared data).
  const empty = (await db.teams.count()) === 0
  if ((import.meta.env.DEV || import.meta.env.VITE_SEED === '1') && (!remoteEnabled() || empty)) {
    const { seedDevData } = await import('./dev/seed')
    await seedDevData()
  }

  if (remoteEnabled()) flush(0) // push the seed / whatever is queued

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
