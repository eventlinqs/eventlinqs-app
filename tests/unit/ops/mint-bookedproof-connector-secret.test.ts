import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { SHAPES } from '../../../src/lib/env/manifest.mjs'

/**
 * THE E51 MINT SCRIPT MUST KEEP ITS REFUSALS AND MINT WHAT THE GUARD ACCEPTS.
 *
 * It stores the secret that switches on Bookedproof's read of EventLinqs
 * organisers, so the things worth pinning are the ones whose loss would switch
 * that read on, or spill the value, without anybody deciding to:
 *
 *   1. what it mints passes the manifest's own shape object, not a copy of it;
 *   2. nothing is stored without --apply, and production never without the
 *      founder typing APPLY, and every production write is logged (the operating
 *      rules of 25 September 2026, rule 4);
 *   3. the value never reaches a process argument or the console: it goes to the
 *      Vercel CLI on stdin, and only a fingerprint is printed;
 *   4. Bookedproof's copy is refused inside a git working tree.
 */
const ROOT = join(__dirname, '..', '..', '..')
const SOURCE = readFileSync(join(ROOT, 'scripts', 'ops', 'mint-bookedproof-connector-secret.mjs'), 'utf8')

describe('mint-bookedproof-connector-secret', () => {
  test('32 random bytes as hex satisfy the manifest shape the guards enforce', () => {
    const shape = SHAPES.strongSecret32 as { pattern: string; minLength: number }
    for (let i = 0; i < 25; i++) {
      const v = randomBytes(32).toString('hex')
      expect(v).toMatch(/^[0-9a-f]{64}$/)
      expect(v.length).toBeGreaterThanOrEqual(shape.minLength)
      expect(new RegExp(shape.pattern).test(v)).toBe(true)
    }
    expect(SOURCE).toContain("randomBytes(32).toString('hex')")
    expect(SOURCE).toContain('SHAPES.strongSecret32')
  })

  test('a dry run by default, and production only on a typed APPLY, logged', () => {
    expect(SOURCE).toMatch(/if \(!APPLY\) \{[\s\S]*?dry run: nothing stored[\s\S]*?process\.exit\(0\)/)
    expect(SOURCE).toMatch(/if \(SCOPE === 'production'\) \{[\s\S]*?askLine\([\s\S]*?if \(typed\.trim\(\) !== 'APPLY'\) fail/)
    expect(SOURCE).toContain("const WRITES_LOG = 'C:\\\\dev\\\\PRODUCTION-WRITES.txt'")
    expect(SOURCE).toMatch(/appendFileSync\(WRITES_LOG, `\$\{stamp\}  founder typed APPLY: APPLIED: /)
    // the typed APPLY comes before the store, never after it
    expect(SOURCE.indexOf("typed.trim() !== 'APPLY'")).toBeLessThan(SOURCE.indexOf("['env', 'add', VAR, SCOPE"))
  })

  test('the value goes on stdin, never as an argument, and is never printed', () => {
    expect(SOURCE).toContain("run('vercel', ['env', 'add', VAR, SCOPE, '--sensitive', '--force', '--yes'], { input: value })")
    expect(SOURCE).not.toMatch(/--value/)
    // Every console line may name the value only through its length or its fingerprint.
    const printed = SOURCE.split('\n').filter((line) => /console\.(log|error)\(/.test(line))
    expect(printed.length).toBeGreaterThan(10)
    for (const line of printed) {
      const cleaned = line
        .replace(/fingerprint\(value\)/g, '')
        .replace(/value\.length/g, '')
        .replace(".replace(value, '<value>')", '')
      expect(cleaned, line).not.toMatch(/\bvalue\b/)
    }
    expect(SOURCE).toContain(".replace(value, '<value>')")
  })

  test("Bookedproof's copy is refused inside a git working tree, and --apply needs one", () => {
    expect(SOURCE).toContain("if (HANDOFF && insideGitTree(HANDOFF)) fail(")
    expect(SOURCE).toContain("if (APPLY && !HANDOFF) fail(")
  })
})
