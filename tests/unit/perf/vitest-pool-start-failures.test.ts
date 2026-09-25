import { describe, expect, it } from 'vitest'
import { poolStartFailures } from '../../../scripts/guards/lib/vitest-pool.mjs'

/**
 * THE MATCHER THAT TELLS A WORKER THAT NEVER STARTED APART FROM A DELETED FILE.
 *
 * The first version of it was blind. It used `[^\n.]+` to take the path, and
 * `[^\n.]` cannot cross a dot, which every test file on this platform has two
 * of. Run against the real captured output below it returned `[]`, so the
 * test-count canary would have carried on reporting "the suite is running LESS
 * than it used to" with the actual cause sitting in a string it already held.
 *
 * That is the third blind matcher found in this tree in two days, after
 * `no-client-sentry-import.mjs` and `no-loadable-in-the-root-shell.mjs`. The
 * first case below is not invented: it is the text vitest actually printed on
 * 18 September 2026, kept verbatim.
 */
const REAL_OUTPUT = `
 RUN  v4.1.5 C:/dev/EventLinqs/eventlinqs-app

Error: [vitest-pool]: Failed to start forks worker for test files C:/dev/EventLinqs/eventlinqs-app/tests/unit/maps/auth-failure-hook.test.ts.
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
 ❯ Timeout.<anonymous> node_modules/vitest/dist/chunks/cli-api.Cjt90eJu.js:3028:58
 ❯ listOnTimeout node:internal/timers:635:17
 Test Files  441 passed (441)
      Tests  5704 passed (5704)
`

describe('reading a vitest worker start failure out of a run', () => {
  it('names the file from the output vitest actually printed', () => {
    expect(poolStartFailures(REAL_OUTPUT)).toEqual([
      'C:/dev/EventLinqs/eventlinqs-app/tests/unit/maps/auth-failure-hook.test.ts',
    ])
  })

  it('reads several files from one message, which is the plural the message is written for', () => {
    expect(
      poolStartFailures('Failed to start forks worker for test files /a/one.test.ts, /a/two.test.tsx.'),
    ).toEqual(['/a/one.test.ts', '/a/two.test.tsx'])
  })

  it('reads a threads pool as well as a forks pool', () => {
    expect(poolStartFailures('Failed to start threads worker for test files /a/x.test.ts.')).toEqual([
      '/a/x.test.ts',
    ])
  })

  /**
   * A matcher that returned everything would pass every case above. These two
   * are the ones that prove it can say no.
   */
  it('says nothing about a clean run', () => {
    expect(poolStartFailures(' Test Files  442 passed (442)\n      Tests  5711 passed (5711)\n')).toEqual([])
  })

  it('says nothing about an ordinary failing test', () => {
    expect(
      poolStartFailures('FAIL tests/unit/x.test.ts > it works\nAssertionError: expected 1 to be 2'),
    ).toEqual([])
  })

  it('is unbothered by empty or missing output', () => {
    expect(poolStartFailures('')).toEqual([])
    expect(poolStartFailures(undefined)).toEqual([])
  })
})
