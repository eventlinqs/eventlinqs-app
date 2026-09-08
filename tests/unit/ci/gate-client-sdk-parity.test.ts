import { describe, expect, test } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envFor, PARITY_SENTRY_DSN } from '../../../scripts/ops/pre-push-gate.mjs'
import { PARITY_SINK_PORT } from '../../../scripts/verify/sentry-parity-sink.mjs'

/**
 * THE LOCAL GATE MUST MEASURE THE BUNDLE THAT DEPLOYS.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` is inlined into the browser bundle at build time,
 * and instrumentation-client.ts loads no SDK at all when it is empty. The
 * founder's .env.local carries it empty, so before 8 September 2026 every local
 * gate build shipped a browser bundle with no error-reporting SDK, while every
 * Vercel preview CI measured shipped one: 217.8 KB of script and 644 ms of
 * evaluation the local Lighthouse step could not see. That is the defect
 * close-out P0.2 describes as "the local gate is lying".
 *
 * These tests hold the fix in place. They do not assert a score; they assert
 * that the environment the build step runs in can never again be missing the
 * variable that decides whether the SDK ships.
 */
describe('the pre-push gate environment', () => {
  const withTempRoot = (envLocal: string | null, body: (root: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), 'gate-env-'))
    try {
      if (envLocal !== null) writeFileSync(join(root, '.env.local'), envLocal)
      body(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  test('fills the client DSN when .env.local declares it empty, which is the real founder case', () => {
    withTempRoot('NEXT_PUBLIC_SENTRY_DSN=""\nNEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"\n', (root) => {
      const env = envFor('local', { root, shell: {} })
      expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe(PARITY_SENTRY_DSN)
      // The rest of the file still loads: the fill must not replace the parse.
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://x.supabase.co')
    })
  })

  test('fills the client DSN when there is no .env.local at all', () => {
    withTempRoot(null, (root) => {
      expect(envFor('local', { root, shell: {} }).NEXT_PUBLIC_SENTRY_DSN).toBe(PARITY_SENTRY_DSN)
    })
  })

  test('a real DSN in .env.local wins, because the fill only ever fills a hole', () => {
    withTempRoot('NEXT_PUBLIC_SENTRY_DSN="https://abc@o1.ingest.sentry.io/2"\n', (root) => {
      expect(envFor('local', { root, shell: {} }).NEXT_PUBLIC_SENTRY_DSN).toBe('https://abc@o1.ingest.sentry.io/2')
    })
  })

  test('a real DSN already in the shell wins over both', () => {
    withTempRoot('NEXT_PUBLIC_SENTRY_DSN="https://fromfile@o1.ingest.sentry.io/2"\n', (root) => {
      const env = envFor('local', { root, shell: { NEXT_PUBLIC_SENTRY_DSN: 'https://fromshell@o1.ingest.sentry.io/3' } })
      expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe('https://fromshell@o1.ingest.sentry.io/3')
    })
  })

  test('steps that do not read .env.local are untouched, so the suite still runs the way CI runs it', () => {
    withTempRoot(null, (root) => {
      expect(envFor('plain', { root, shell: {} }).NEXT_PUBLIC_SENTRY_DSN).toBeUndefined()
    })
  })

  test('the parity DSN can never leave this machine, and answers locally', () => {
    // It points at loopback, so nothing it sends can reach a real project, which
    // is the failure shouldInitSentry() exists to stop.
    const url = new URL(PARITY_SENTRY_DSN)
    expect(url.hostname).toBe('127.0.0.1')
    expect(PARITY_SENTRY_DSN).not.toMatch(/sentry\.io/)
    // Shape-valid, or the SDK refuses to init and the parity is worthless.
    expect(PARITY_SENTRY_DSN).toMatch(/^https?:\/\/[0-9a-f]+@127\.0\.0\.1:\d+\/\d+$/)
  })

  test('the DSN names the port the sink listens on, so the two cannot drift', () => {
    /*
     * THE FIRST ATTEMPT USED AN UNRESOLVABLE `.invalid` HOST AND THE GATE
     * REFUSED IT. The SDK opens a session envelope on every page load; the
     * request failed with ERR_NAME_NOT_RESOLVED; Chrome logged it; Lighthouse's
     * errors-in-console audit took best practices from 1.00 to 0.93 on all
     * thirteen gated URLs on all five runs. A parity fix that introduces a
     * difference of its own is not parity.
     *
     * The DSN is inlined at BUILD time, so the port cannot be chosen later. It
     * is fixed, and this test is what stops the constant and the server that
     * answers it drifting apart.
     */
    expect(new URL(PARITY_SENTRY_DSN).port).toBe(String(PARITY_SINK_PORT))
  })
})
