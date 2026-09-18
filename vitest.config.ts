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
    /*
     * HOW MANY WORKER PROCESSES, AND WHY IT IS NOT "AS MANY AS THERE ARE CORES".
     *
     * The paragraph above is about a test being too SLOW. This one is about a
     * worker that never STARTS, which looks nothing like a slow test and is much
     * worse, because vitest reports it as files that simply are not there.
     *
     * Measured on 18 September 2026, running `npx vitest run` on a clean tree:
     *
     *   Error: [vitest-pool]: Failed to start forks worker for test files
     *     tests/unit/maps/auth-failure-hook.test.ts.
     *   Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
     *    Test Files  441 passed (441)
     *
     * 441 of 442. Nothing failed. One file was never run and the suite still
     * called itself green, and it is only the test-count canary that turns that
     * into a refusal at all. Earlier the same day the same cause took ELEVEN
     * files and 75 tests out of a gate run, and the reading at the time was that
     * eleven files had "stopped collecting", which sent the search into the tree
     * instead of at the runner.
     *
     * THE CAUSE IS MEMORY, NOT CORES. This machine has 12 cores and 16.6 GB, and
     * it is shared: three build lanes and a marketing process run on it at once.
     * Free memory measured while this was happening was 6.2 GB. vitest's default
     * is one fork per core less one, so it was starting eleven Node processes,
     * each carrying a full module graph, into that. `START_TIMEOUT` in vitest's
     * pool is a hardcoded 60 seconds (node_modules/vitest/dist/chunks/
     * cli-api.Cjt90eJu.js:2782) and is not configurable, so there is no knob on
     * that side: the only lever is asking for fewer processes at once.
     *
     * THIS DOES NOT WEAKEN ANYTHING. Every test still runs and every test still
     * has to pass; the only thing that changes is how many run at the same
     * moment.
     *
     * `maxWorkers` is the vitest 4 spelling and it is TOP LEVEL, not under
     * `poolOptions`: that key does not exist in this version's `InlineConfig`
     * and typecheck says so (read from node_modules/vitest/dist/chunks/
     * reporters.d.CEnv6XRv.d.ts, "Maximum number or percentage of workers to run
     * tests in"). A fixed 6 rather than a percentage, deliberately: a percentage
     * would also halve a CI runner, where 4 cores are already the constraint and
     * nothing else is competing. As a MAXIMUM, 6 simply never binds there.
     */
    maxWorkers: 6,
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
