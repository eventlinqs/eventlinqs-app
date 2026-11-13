import { describe, expect, it } from 'vitest'
import { judgedByRunGuards } from '../../../scripts/guards/lib/guard-drill-coverage.mjs'

/*
 * THE ECHO, SAID AND NOT COUNTED (the guard audit of 14 November 2026, C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md). Seven of
 * the week's 79 guard stops were excluded-reads-survive-the-upload repeating another guard's failure. A registered guard
 * red in the whole tree is judged by run-guards in the same gate; any other prebuild script still fails in the upload
 * guard, which is what its failure drill plants.
 */
const runGuards = `const GUARDS = [\n  'scripts/guards/positioning-lock.mjs',\n  'scripts/guards/excluded-reads-survive-the-upload.mjs',\n]`

describe('who judges a script that is red in the whole tree', () => {
  it('a registered guard is judged by run-guards, so the upload guard defers', () => {
    expect(judgedByRunGuards('scripts/guards/positioning-lock.mjs', runGuards)).toBe(true)
  })

  it('a prebuild script that is not a registered guard is still the upload guard\'s to fail', () => {
    expect(judgedByRunGuards('scripts/verify/launch-readiness.mjs', runGuards)).toBe(false)
    expect(judgedByRunGuards('scripts/check-pricing-lock.mjs', runGuards)).toBe(false)
  })

  it('reads a Windows path as the same script', () => {
    expect(judgedByRunGuards('scripts\\guards\\positioning-lock.mjs', runGuards)).toBe(true)
  })
})
