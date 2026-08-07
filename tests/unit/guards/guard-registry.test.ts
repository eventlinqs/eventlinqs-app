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

/** Files in scripts/guards/ that are not themselves guards. */
const NOT_GUARDS = new Set(['run-guards.mjs', 'contract-node.mjs'])

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

  test('the runner actually invokes the registry rather than a hardcoded list', () => {
    // Guards against the list becoming decorative: the loop must iterate GUARDS.
    const src = readFileSync(RUNNER, 'utf8')
    expect(src).toMatch(/for \(const guard of GUARDS\)/)
    expect(src).toMatch(/spawnSync\(process\.execPath, \[join\(ROOT, guard\)\]/)
  })
})
