import { describe, expect, test } from 'vitest'
import { POLICIES } from '@/lib/rate-limit/policies'

describe('rate-limit POLICIES', () => {
  test('every policy has a non-empty keyPrefix', () => {
    for (const [name, policy] of Object.entries(POLICIES)) {
      expect(policy.keyPrefix.length, `${name}.keyPrefix`).toBeGreaterThan(0)
    }
  })

  test('every policy has a positive limit and window', () => {
    for (const [name, policy] of Object.entries(POLICIES)) {
      expect(policy.limit, `${name}.limit`).toBeGreaterThan(0)
      expect(policy.windowSec, `${name}.windowSec`).toBeGreaterThan(0)
    }
  })

  test('every policy has a non-empty rationale', () => {
    for (const [name, policy] of Object.entries(POLICIES)) {
      expect(policy.rationale.length, `${name}.rationale`).toBeGreaterThan(20)
    }
  })

  test('keyPrefixes are unique across policies', () => {
    const seen = new Set<string>()
    for (const [name, policy] of Object.entries(POLICIES)) {
      expect(seen.has(policy.keyPrefix), `duplicate prefix ${policy.keyPrefix} on ${name}`).toBe(
        false
      )
      seen.add(policy.keyPrefix)
    }
  })

  test('synthetic-error endpoint has the strictest cap', () => {
    expect(POLICIES['health-sentry-error'].limit).toBeLessThanOrEqual(10)
  })
})
