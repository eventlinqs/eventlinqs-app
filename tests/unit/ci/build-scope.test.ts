import { describe, expect, test } from 'vitest'

import { describeBuildScope, resolveBuildScope } from '../../../src/lib/health/build-scope.mjs'

/**
 * CI IS NOT A LAPTOP. Close-out F1.3.
 *
 * On 8 September 2026 scripts/check-public-env.mjs printed "WARNING (not
 * blocking - local build)" while running inside GitHub Actions, in the job whose
 * whole purpose is to refuse a commit Vercel would refuse. Its only test was
 * "is VERCEL set", so everything that was not Vercel was a developer's laptop.
 *
 * The classification is now three-way and shared, and these tests pin the two
 * properties that make it correct: the middle case BLOCKS, and Vercel is decided
 * before CI, because Vercel's own documentation publishes CI=1 on its builds
 * (https://vercel.com/docs/environment-variables/system-environment-variables,
 * fetched 2026-09-09) and testing CI first would classify every deployment as a
 * CI runner.
 */
describe('resolveBuildScope', () => {
  test('a Vercel build is vercel, decided by VERCEL', () => {
    expect(resolveBuildScope({ VERCEL: '1' })).toEqual({ scope: 'vercel', by: 'VERCEL', blocks: true })
  })

  test('VERCEL_ENV alone is enough, and is named as the decider', () => {
    expect(resolveBuildScope({ VERCEL_ENV: 'preview' })).toEqual({
      scope: 'vercel',
      by: 'VERCEL_ENV',
      blocks: true,
    })
  })

  test('a Vercel build that also carries CI=1 is still vercel, not ci', () => {
    // Vercel publishes CI=1 at build time. Testing CI first would lose the scope
    // that carries the real project, and every deployment would be called a runner.
    expect(resolveBuildScope({ VERCEL: '1', CI: '1' }).scope).toBe('vercel')
  })

  test('GitHub Actions is ci, and it BLOCKS', () => {
    expect(resolveBuildScope({ GITHUB_ACTIONS: 'true', CI: 'true' })).toEqual({
      scope: 'ci',
      by: 'GITHUB_ACTIONS',
      blocks: true,
    })
  })

  test('a hosted runner that only sets CI is still ci', () => {
    expect(resolveBuildScope({ CI: 'true' })).toEqual({ scope: 'ci', by: 'CI', blocks: true })
  })

  test('an empty environment is local, and it WARNS, because a fresh clone must still build', () => {
    const verdict = resolveBuildScope({})
    expect(verdict.scope).toBe('local')
    expect(verdict.blocks).toBe(false)
  })

  test('the local verdict names what was absent, so it can be argued with', () => {
    expect(resolveBuildScope({}).by).toContain('GITHUB_ACTIONS')
  })

  test('the regression itself: GitHub Actions is never called a local build again', () => {
    const before = { VERCEL: undefined, VERCEL_ENV: undefined, GITHUB_ACTIONS: 'true' }
    expect(resolveBuildScope(before).scope).not.toBe('local')
    expect(resolveBuildScope(before).blocks).toBe(true)
  })
})

describe('describeBuildScope', () => {
  test('every caller prints the scope AND the variable that decided it', () => {
    const line = describeBuildScope({ GITHUB_ACTIONS: 'true' })
    expect(line).toContain('scope=ci')
    expect(line).toContain('decided by GITHUB_ACTIONS')
    expect(line).toContain('BLOCKS')
  })

  test('a developer machine says plainly that it only warns', () => {
    expect(describeBuildScope({})).toContain('WARNS')
  })
})
