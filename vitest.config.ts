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
    /**
     * 30 SECONDS, NOT VITEST'S 5, AND THE REASON IS A DEFECT CLASS RATHER THAN A
     * SLOW MACHINE.
     *
     * Several tests here are deterministic and CPU-heavy by design: scrypt key
     * derivation in tests/unit/admin/totp.test.ts (a KDF is SUPPOSED to be slow),
     * 120 exhaustive font-layout cases in tests/unit/social-cards.test.ts, and
     * the subprocess gates. Alone each finishes in about 2 to 3 seconds. Under
     * full parallel load the same work crosses 5s and vitest kills it.
     *
     * WHAT THAT COSTS, and why it is worth a config line. Two consecutive full
     * runs on 15 August 2026 failed on two DIFFERENT tests, both with
     * "Test timed out in 5000ms", and both passed in isolation. In the output a
     * timeout is indistinguishable from a real regression, so the next person
     * goes hunting for a bug in the fitter or the KDF that was never there. It
     * also makes the suite non-deterministic, which quietly undermines every
     * green run: "it passed" stops meaning anything if the same tree can go
     * either way.
     *
     * This does NOT weaken anything. A test that genuinely hangs still fails; it
     * fails at 30s instead of 5s, against a suite that already takes about 50s.
     * What it removes is a whole category of red that was never about the code.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
