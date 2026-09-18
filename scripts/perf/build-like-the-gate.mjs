/**
 * BUILD THIS TREE THE WAY THE PUSH GATE BUILDS IT, AND NOTHING ELSE.
 *
 * WHY THIS EXISTS. A bare `next build` does not produce the bundle anybody
 * deploys or the bundle CI measures. `scripts/ops/pre-push-gate.mjs` fills an
 * empty `NEXT_PUBLIC_SENTRY_DSN` with a loopback parity DSN before building,
 * because that value is INLINED at build time and the error-reporting SDK
 * refuses to load without it. A build without it emits a browser bundle with no
 * SDK in it and a framework chunk 124 bytes smaller per route, and this
 * repository has produced a confident number from that wrong build three times
 * in two days (C:\dev\LANE-RETURNS.md, 18 September 2026).
 *
 * So a measurement build, or a build a driven proof will be run against, uses
 * `envFor('local')` from the gate itself rather than a second copy of the same
 * intention. There is one definition of "the environment this tree builds in"
 * and it lives in the gate.
 *
 * THIS IS NOT THE GATE'S BUILD STEP. It runs `next build` and stops: no guards,
 * no suite, no Lighthouse, no push. Running the gate's own build step is the
 * push lane's job.
 *
 * Usage:  node scripts/perf/build-like-the-gate.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envFor } from '../ops/pre-push-gate.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = envFor('local')

if (!env.NEXT_PUBLIC_SENTRY_DSN) {
  console.error('[build-like-the-gate] envFor(local) produced no NEXT_PUBLIC_SENTRY_DSN.')
  console.error('[build-like-the-gate] That is the one thing this script exists to guarantee, so it refuses rather')
  console.error('[build-like-the-gate] than building a bundle nobody deploys.')
  process.exit(1)
}
console.log('[build-like-the-gate] building with the gate environment (parity Sentry DSN present)')

const run = spawnSync(process.execPath, [join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
})
process.exitCode = run.status ?? 1
