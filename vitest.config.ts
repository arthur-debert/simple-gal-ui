import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest is scoped to `tests/unit/**` so it does not collide with the
// Playwright e2e specs under `tests/` (those use the `.spec.ts` extension
// and Playwright's own runner). Keep the unit suite light: pure-function
// modules from `electron/` and `src/lib/` only — anything that needs an
// Electron BrowserWindow belongs in a Playwright spec.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib')
    }
  }
})
