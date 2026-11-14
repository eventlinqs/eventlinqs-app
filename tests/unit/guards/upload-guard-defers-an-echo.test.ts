import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { judgedByRunGuards } from '../../../scripts/guards/lib/guard-drill-coverage.mjs'

/*
 * THE ECHO, SAID AND NOT COUNTED (the guard audit of 14 November 2026, C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md). Seven of
 * the week's 79 guard stops were excluded-reads-survive-the-upload repeating another guard's failure. A registered guard
 * red in the whole tree is judged by run-guards in the same gate; any other prebuild script still fails in the upload
 * guard. Its failure drill plants the guard's own class (a file the whole tree keeps and the upload strips), never a
 * path missing from both trees: that first form passed only through the echo, and went quiet the day the echo ended
 * (found by the audit car's own drill run, 14 November 2026, 10:27).
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

describe("the upload guard's failure drill plants its own class", () => {
  const drills = readFileSync('scripts/verify/guard-failure-drills.mjs', 'utf8').replace(/\r\n/g, '\n')
  const drill = (name: string): string => {
    const at = drills.indexOf(`name: '${name}'`)
    expect(at).toBeGreaterThan(-1)
    return drills.slice(at, drills.indexOf('\n  },', at))
  }

  it('strips a file the whole tree keeps, and expects the stripped file named as the cause', () => {
    const d = drill('a prebuild guard reads a docs path the upload does not carry')
    expect(d).toContain('excluded-reads-survive-the-upload.mjs')
    expect(d).toContain("file: '.vercelignore'")
    expect(d).toContain("expect: 'so a stripped file is the cause'")
  })

  it('leaves a report path that names no file to the guard that owns it', () => {
    const d = drill('the readiness report path names a file that is in neither tree')
    expect(d).toContain('launch-readiness-honest.mjs')
    expect(d).toContain("expect: 'is DELETED, not stripped'")
  })
})
