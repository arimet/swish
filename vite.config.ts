import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devApi } from './dev-api.js'

export default defineConfig(({ mode }) => {
  // Vite only pours `VITE_`-prefixed variables into `import.meta.env`, and does not
  // touch `process.env`. But the `api/` functions read `DATABASE_URL` and
  // `SYNC_WRITE_TOKEN` — two secrets that must emphatically NOT be prefixed, or they
  // would leave in the bundle. So we pour them by hand, so that development's `.env`
  // reaches them the way Vercel would.
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['DATABASE_URL', 'SYNC_WRITE_TOKEN']) if (env[k]) process.env[k] = env[k]

  return {
  plugins: [
    react(),
    tailwindcss(),
    devApi(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        // The same title as `index.html`, and for the same reason: it names the
        // product — a team's hub — and not one of its nine screens.
        name: 'Swish — Le hub de votre équipe de basket',
        short_name: 'Swish',
        description: 'Table de marque, statistiques, calendrier et schémas tactiques pour une équipe de basket amateur.',
        display: 'standalone',
        // The splash screen and the installed application's bar: the light theme's
        // frame and gutter, like the index's `theme-color`. These two follow
        // `ui/theme/themes.css` by hand — a PWA manifest does not read CSS
        // variables.
        background_color: '#0e1116',
        theme_color: '#07090c',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // The suite exercises the local-first path, and must not depend on the `.env`
    // of the machine running it: a developer who plugs in their dev database would
    // otherwise see a dozen screens head off to the network and sit on "Loading…".
    // A test of the synchronisation itself would set its own value, explicitly.
    env: { VITE_SYNC_URL: '' },
    // Worktrees live under `.claude/`, hence *inside* the repo: without this
    // exclusion, a run from the root also picks up the tests of every branch in
    // progress and fails them on an `@` alias pointing elsewhere. Two hundred
    // failures that say nothing about `main`'s code.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
  }
})
