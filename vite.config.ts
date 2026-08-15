import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devApi } from './dev-api.js'

export default defineConfig(({ mode }) => {
  // Vite ne verse dans `import.meta.env` que les variables préfixées `VITE_`, et
  // ne touche pas à `process.env`. Or les fonctions d'`api/` lisent `DATABASE_URL`
  // et `SYNC_WRITE_TOKEN` — deux secrets qui ne doivent surtout PAS être préfixés,
  // sans quoi ils partiraient dans le bundle. On les verse donc à la main, pour
  // que le `.env` du développement les atteigne comme le ferait Vercel.
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
        // Le même titre qu'`index.html`, et pour la même raison : il nomme le produit
        // — le hub d'une équipe — et non l'un de ses neuf écrans.
        name: 'Swish — Le hub de votre équipe de basket',
        short_name: 'Swish',
        description: 'Table de marque, statistiques, calendrier et schémas tactiques pour une équipe de basket amateur.',
        display: 'standalone',
        // L'écran de démarrage et la barre de l'application installée : le cadre
        // et la gouttière du thème clair, comme les `theme-color` de l'index.
        // Ces deux-là suivent `ui/theme/themes.css` à la main — un manifeste PWA
        // ne lit pas de variables CSS.
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
    // La suite exerce le chemin local-first, et elle ne doit pas dépendre du
    // `.env` de la machine qui la lance : un développeur qui branche sa base de
    // développement verrait sinon une dizaine d'écrans partir chercher le réseau
    // et rester sur « Chargement… ». Un test de la synchronisation elle-même
    // poserait sa propre valeur, explicitement.
    env: { VITE_SYNC_URL: '' },
    // Les worktrees vivent sous `.claude/`, donc *dans* le dépôt : sans cette
    // exclusion, une exécution depuis la racine ramasse aussi les tests de
    // chaque branche en cours et les fait échouer sur un alias `@` qui pointe
    // ailleurs. Deux cents échecs qui ne disent rien du code de `main`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
  }
})
