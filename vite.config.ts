import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devApi } from './dev-api.js'

export default defineConfig(({ mode }) => {
  // Vite only pours `VITE_`-prefixed variables into `import.meta.env`, and does not
  // touch `process.env`. But the `api/` functions read `DATABASE_URL` and
  // `WRITE_TOKEN` — two secrets that must emphatically NOT be prefixed, or they
  // would leave in the bundle. So we pour them by hand, so that development's `.env`
  // reaches them the way Vercel would.
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['DATABASE_URL', 'WRITE_TOKEN']) if (env[k]) process.env[k] = env[k]

  return {
  plugins: [
    react(),
    tailwindcss(),
    devApi(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // `setupTests` also installs the fake API every test reads and writes through:
    // there is no local store any more, so a test with no server has no data at all.
    setupFiles: ['./src/setupTests.ts'],
    // Worktrees live under `.claude/`, hence *inside* the repo: without this
    // exclusion, a run from the root also picks up the tests of every branch in
    // progress and fails them on an `@` alias pointing elsewhere. Two hundred
    // failures that say nothing about `main`'s code.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
  }
})
