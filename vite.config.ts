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
        name: 'Swish — Feuille de match basket',
        short_name: 'Swish',
        description: 'Table de marque basket : score, chrono, fautes, stats et export e-marque.',
        display: 'standalone',
        // L'écran de démarrage et la barre de l'application installée : la
        // page claire, comme le `theme-color` de l'index.
        background_color: '#eef1f6',
        theme_color: '#d8dce5',
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
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] },
})
