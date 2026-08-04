import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const srcAlias = fileURLToPath(new URL('./src', import.meta.url))
// server-only / client-only are Next.js build-time marker packages, not present
// in node_modules. Alias them to a no-op so server modules that import the guard
// can still be unit-tested under vitest's node resolver.
const emptyStub = fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url))

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
    alias: { '@': srcAlias, 'server-only': emptyStub, 'client-only': emptyStub },
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
          // Strips ambient Supabase/Stripe env before any test module loads, so
          // the suite result is identical on a laptop with .env.test sourced,
          // on a fresh clone, and in CI. See tests/setup-clean-env.ts.
          setupFiles: ['./tests/setup-clean-env.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup-clean-env.ts', './tests/component/setup.ts'],
          globals: true,
        },
      },
    ],
  },
})
