import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/theme/ThemeProvider'
import { db } from './persistence/db'
import { remoteEnabled, hydrate, flush } from './persistence/remote'

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
        <App />
      </ThemeProvider>
    </StrictMode>,
  )
}

bootstrap()
