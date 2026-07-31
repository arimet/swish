import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/theme/ThemeProvider'

async function bootstrap() {
  // Données de démo : en développement, ou en production si VITE_SEED=1
  // (utile pour une démo déployée sur Vercel).
  if (import.meta.env.DEV || import.meta.env.VITE_SEED === '1') {
    const { seedDevData } = await import('./dev/seed')
    await seedDevData()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>,
  )
}

bootstrap()
