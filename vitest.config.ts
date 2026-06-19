import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const srcAlias = fileURLToPath(new URL('./src', import.meta.url))

/**
 * Two test projects:
 *   - node:      the existing logic tests (tests/unit), node environment,
 *                untouched so they keep running exactly as before.
 *   - component: React component tests (tests/component) in jsdom with
 *                @testing-library, for the admin UI.
 * `npm test` runs both.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { '@': srcAlias },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          globals: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/component/setup.ts'],
          globals: true,
        },
      },
    ],
  },
})
