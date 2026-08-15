import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
    // Les worktrees vivent sous `.claude/`, donc *dans* le dépôt : sans cette
    // exclusion, une exécution depuis la racine ramasse aussi les tests de
    // chaque branche en cours et les fait échouer sur un alias `@` qui pointe
    // ailleurs. Deux cents échecs qui ne disent rien du code de `main`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
