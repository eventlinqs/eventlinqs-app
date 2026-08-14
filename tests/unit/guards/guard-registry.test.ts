import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE REGISTRY CANNOT QUIETLY LOSE A GUARD.
 *
 * WHY THIS TEST EXISTS. On 2026-08-08 a rebase put two independent build-guard
 * systems on the same `prebuild` line: PR #111's client barrel guard, which
 * protects the size of the browser bundle, and this branch's guard runner, which
 * protects the auth surface and the runtime. Git presented that as one conflicted
 * line, and the shape of the conflict made "keep my side" delete the other side's
 * guard while the build stayed green.
 *
 * The resolution registered both in one list. `run-guards.mjs` then checks that
 * every registered path EXISTS, which catches a mistyped or renamed path. It does
 * NOT catch the failure that actually happened: someone deleting a line from the
 * list. Six guards would run, all would pass, the runner would print "all 6
 * guards PASS", and an entire class of regression would stop being checked with
 * nothing anywhere going red.
 *
 * So the list is asserted from the outside, by something the deleter is not
 * editing. Removing a registration now turns a test red in CI.
 */

const ROOT = join(__dirname, '..', '..', '..')
const RUNNER = join(ROOT, 'scripts', 'guards', 'run-guards.mjs')

function registeredGuards(): string[] {
  const src = readFileSync(RUNNER, 'utf8')
  const block = /const GUARDS = \[([\s\S]*?)\n\]/.exec(src)
  if (!block) throw new Error('could not find the GUARDS array in run-guards.mjs')
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/**
 * Guards that live outside scripts/guards/ and so cannot be found by the
 * directory sweep below. Each is named with the line of work it came from, so a
 * future reader knows why an apparently unrelated script is load-bearing here.
 */
const EXTERNAL_GUARDS = [
  {
    path: 'scripts/check-client-barrel-imports.mjs',
    from: 'PR #111, the Sentry SDK deferral. Without it the browser bundle stops being checked for untree-shakeable namespace imports.',
  },
]

/**
 * Files in scripts/guards/ that are not themselves prebuild guards.
 *
 * `test-count-canary.mjs` is deliberately NOT registered in the runner, and the
 * reason is a real trade rather than an oversight. It RUNS THE WHOLE TEST SUITE
 * to count what executed, which takes about thirty seconds. `prebuild` runs on
 * every Vercel build, and by build time the code has already been pushed, so
 * paying that there would cost half a minute per deployment and catch nothing a
 * push-time check has not already caught. It is wired into `.githooks/pre-push`
 * instead, where a push is the moment work becomes shared.
 */
const NOT_GUARDS = new Set(['run-guards.mjs', 'contract-node.mjs', 'test-count-canary.mjs'])

describe('the build-guard registry', () => {
  test('every guard file in scripts/guards/ is registered in the runner', () => {
    const onDisk = readdirSync(join(ROOT, 'scripts', 'guards'))
      .filter((f) => f.endsWith('.mjs') && !NOT_GUARDS.has(f))
      .map((f) => `scripts/guards/${f}`)
      .sort()

    const registered = registeredGuards()
    const missing = onDisk.filter((g) => !registered.includes(g))

    expect(
      missing,
      `these guards exist but nothing runs them, so they protect nothing: ${missing.join(', ')}`,
    ).toEqual([])
  })

  test.each(EXTERNAL_GUARDS)('the external guard $path stays registered', ({ path, from }) => {
    expect(
      registeredGuards(),
      `${path} was dropped from the runner. It came from ${from}`,
    ).toContain(path)
  })

  test('every registered guard exists on disk', () => {
    const absent = registeredGuards().filter((g) => !existsSync(join(ROOT, g)))
    expect(absent, `registered but not on disk: ${absent.join(', ')}`).toEqual([])
  })

  test('the header comment names every registered guard', () => {
    // The runner opens by listing what each guard enforces. That list is a
    // citation, and an unmaintained citation is the exact defect this branch
    // spent Phase 2.1 fixing: src/lib/auth/providers.ts pointed at a script that
    // did not exist, and nobody noticed because prose is not executed. Adding a
    // guard without describing it, or deleting one and leaving the description,
    // both turn this red.
    const header = readFileSync(RUNNER, 'utf8').split('*/')[0]
    const undescribed = registeredGuards()
      .map((g) => g.split('/').pop()!.replace(/\.mjs$/, ''))
      // The header uses the short name for the branch's own guards and the file
      // name for the external one, so accept either.
      .filter((name) => !header.includes(name) && !header.includes(name.replace(/-guard$/, '')))

    expect(
      undescribed,
      `registered but not described in the runner's header comment: ${undescribed.join(', ')}`,
    ).toEqual([])
  })

  test('the runner actually invokes the registry rather than a hardcoded list', () => {
    // Guards against the list becoming decorative: the loop must iterate GUARDS.
    const src = readFileSync(RUNNER, 'utf8')
    expect(src).toMatch(/for \(const guard of GUARDS\)/)
    expect(src).toMatch(/spawnSync\(process\.execPath, \[join\(ROOT, guard\)\]/)
  })
})
