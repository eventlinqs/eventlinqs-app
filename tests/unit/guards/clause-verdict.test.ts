import { describe, expect, test } from 'vitest'

import { isVerdictCode, renderVerdict, VERDICT_CODES } from '../../../scripts/guards/lib/clause-verdict.mjs'

/**
 * ONE GUARD, THREE MACHINES, ONE SENTENCE SHAPE. Close-out F1.6.
 *
 * machine-callers-reachable skipped its live-Vercel clause for a different
 * reason, in a different shape, on each machine that ran it: "needs a Vercel
 * token" on Vercel, "Vercel answered 404" in CI, and no skip at all on the
 * laptop. Two full log reads went on noticing that the three lines were about
 * the same clause.
 *
 * These tests pin the two properties that make the lines comparable: the code
 * comes from a closed set, and the line always carries the code AND the scope.
 */
describe('the verdict vocabulary is closed', () => {
  test('the named codes are exactly the ones the guard documents', () => {
    expect(VERDICT_CODES).toEqual(['judged', 'no-token', 'no-project-ids', 'network-error'])
  })

  test('an http status joins the set without listing every status', () => {
    expect(isVerdictCode('http-404')).toBe(true)
    expect(isVerdictCode('http-403')).toBe(true)
    expect(isVerdictCode('http-500')).toBe(true)
  })

  test('an invented shape is refused, so a sixth kind of skip cannot appear at a call site', () => {
    expect(isVerdictCode('skipped-loudly')).toBe(false)
    expect(isVerdictCode('http-99')).toBe(false)
    expect(() =>
      renderVerdict({ tag: '[t]', clause: 'c', code: 'skipped-loudly', detail: 'd', remedy: 'r', env: {} }),
    ).toThrow(/is not a verdict code/)
  })
})

describe('the line the three machines produce', () => {
  const base = { tag: '[machine-callers-reachable]', clause: 'clause 4', detail: 'why', remedy: 'do this' }

  test('Vercel with no token, and CI refused, are the same shape with different codes', () => {
    const onVercel = renderVerdict({ ...base, code: 'no-token', env: { VERCEL: '1' } })[0]
    const inCi = renderVerdict({ ...base, code: 'http-404', env: { GITHUB_ACTIONS: 'true' } })[0]
    expect(onVercel).toContain('NOT JUDGED [no-token] on scope=vercel')
    expect(inCi).toContain('NOT JUDGED [http-404] on scope=ci')
  })

  test('a laptop that could read it says JUDGED, and adds no remedy', () => {
    const lines = renderVerdict({ ...base, code: 'judged', env: {} })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('JUDGED [judged] on scope=local')
  })

  test('every not-judged verdict carries the remedy, so a skip is never a dead end', () => {
    for (const code of VERDICT_CODES.filter((c) => c !== 'judged')) {
      const lines = renderVerdict({ ...base, code, env: { CI: 'true' } })
      expect(lines).toHaveLength(3)
      expect(lines[2]).toContain('do this')
    }
  })

  test('the detail travels, because a status with no reason is what F1.6 was about', () => {
    const line = renderVerdict({
      ...base,
      code: 'http-403',
      detail: 'Vercel said: forbidden: Not authorized',
      env: { GITHUB_ACTIONS: 'true' },
    })[0]
    expect(line).toContain('forbidden: Not authorized')
  })
})
