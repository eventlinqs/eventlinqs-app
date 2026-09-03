import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { SHAPES } from '../../../src/lib/env/manifest.mjs'

/**
 * THE REPAIR SCRIPT MUST KEEP ITS REFUSALS AND MUST MINT WHAT THE GUARD ACCEPTS.
 *
 * On 3 September 2026 production was stuck on the previous release because the
 * value stored for ORDER_ACCESS_SECRET on the production scope failed the
 * manifest shape (92 characters, containing whitespace). The repair script
 * replaced it and redeployed. Two things about that script are worth pinning:
 *
 *   1. The value it mints is exactly what scripts/check-public-env.mjs will
 *      accept, judged by the SAME shape object rather than a copy of the regex,
 *      so the manifest and the repair cannot drift apart.
 *   2. Its refusals stay in the source. Rotating this secret invalidates every
 *      guest order link minted with the old one, so the script reads the served
 *      release and refuses when that release can mint links, unless the caller
 *      accepts the invalidation explicitly. Deleting that check would make the
 *      script a foot-gun that happens to have worked once.
 */
const ROOT = join(__dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'ops', 'repair-order-access-secret.mjs')

describe('repair-order-access-secret', () => {
  test('a 48 byte base64url value satisfies the manifest shape the guard enforces', () => {
    const shape = SHAPES.strongSecret32 as { pattern: string; minLength: number }
    for (let i = 0; i < 25; i++) {
      const v = randomBytes(48).toString('base64url')
      expect(v.length).toBe(64)
      expect(v.length).toBeGreaterThanOrEqual(shape.minLength)
      expect(new RegExp(shape.pattern).test(v)).toBe(true)
      expect(/\s/.test(v)).toBe(false)
    }
  })

  test('a value with a trailing newline is exactly what the shape rejects', () => {
    const shape = SHAPES.strongSecret32 as { pattern: string }
    const pasted = `${randomBytes(48).toString('base64url')}\n`
    expect(new RegExp(shape.pattern).test(pasted)).toBe(false)
  })

  test('the script keeps its refusals and never prints the value', () => {
    const src = readFileSync(SCRIPT, 'utf8')
    // Logged in, linked project, blast radius, shape proof, no newline on stdin.
    expect(src).toContain("run('vercel', ['whoami'])")
    expect(src).toContain('EXPECTED_PROJECT')
    expect(src).toContain('--accept-link-invalidation')
    expect(src).toContain("'cat-file', '-e'")
    expect(src).toContain('SHAPES.strongSecret32')
    expect(src).toContain("['env', 'update', VAR, SCOPE, '--sensitive', '--yes'], { input: next }")
    // The only things printed about the secret are its length and fingerprint:
    // the bare value is never interpolated into any string anywhere.
    expect(src).not.toContain('${next}')
    expect(src).not.toMatch(/console\.(log|error)\(\s*next\b/)
    expect(src).toContain('next.length')
    expect(src).toContain('fingerprint(next)')
  })

  test('the script proves the result by observing the served release, not by trusting the API', () => {
    const src = readFileSync(SCRIPT, 'utf8')
    expect(src).toContain('sentry-release=')
    expect(src).toContain('served.startsWith(EXPECT_SHA)')
  })
})
