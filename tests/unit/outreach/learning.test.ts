import { describe, expect, test } from 'vitest'
import { ALPHA, MIN_EXPECTED, MIN_SENT_PER_HALF_EXCLUSIVE, Z_CRITICAL, halfOf, judgeVariant } from '@/lib/outreach/learning'

/* THE LEARNING LOOP (the engine plan's FULL AUTOMATION: "each play tests one change at a time ... against the current
   template on equal random halves; a variant replaces the template only on a measured rise in claims (not opens),
   recorded with the numbers"). Window 6, 29 October 2026. The test and its limits are NIST's (see learning.ts). */

describe('the numbers, each from its source', () => {
  test('NIST 7.2.4: N > 30, and min{Np, N(1-p)} >= 5; NIST 1.3.6.7.1: 1.645 at p = 0.950; alpha 0.05 a stated choice', () => {
    expect([MIN_SENT_PER_HALF_EXCLUSIVE, MIN_EXPECTED, Z_CRITICAL, ALPHA]).toEqual([30, 5, 1.645, 0.05])
  })
})

describe('judging a variant against the current template', () => {
  test('a clear rise in claims, on enough messages, and the variant wins', () => {
    const j = judgeVariant({ sent: 200, claims: 10 }, { sent: 200, claims: 30 })
    expect(j.outcome).toBe('variant_wins')
    expect(j.z).toBeGreaterThan(Z_CRITICAL)
  })

  test('the same rates, and the current template is kept', () => {
    const j = judgeVariant({ sent: 200, claims: 20 }, { sent: 200, claims: 20 })
    expect(j.outcome).toBe('keep')
    expect(j.z).toBe(0)
  })

  test('a rise too small to count is kept, never called a win', () => {
    expect(judgeVariant({ sent: 200, claims: 20 }, { sent: 200, claims: 26 }).outcome).toBe('keep')
  })

  test('a variant doing worse is kept out', () => {
    expect(judgeVariant({ sent: 200, claims: 30 }, { sent: 200, claims: 10 }).outcome).toBe('keep')
  })

  test('30 messages in a half is not enough (N > 30)', () => {
    const j = judgeVariant({ sent: 30, claims: 10 }, { sent: 200, claims: 60 })
    expect(j.outcome).toBe('not_enough')
    expect(j.z).toBeNull()
    expect(j.why).toMatch(/more than 30/)
  })

  test('too few claims for the normal approximation (min{Np, N(1-p)} >= 5) is not enough, however large the rise', () => {
    const j = judgeVariant({ sent: 40, claims: 0 }, { sent: 40, claims: 4 })
    expect(j.outcome).toBe('not_enough')
    expect(j.why).toMatch(/at least 5/)
  })

  test('the z is the pooled statistic of NIST 7.3.3', () => {
    // p1 = 30/200, p2 = 10/200, pooled 40/400 = 0.1; se = sqrt(0.1 * 0.9 * (1/200 + 1/200)) = 0.03; z = 0.1 / 0.03
    expect(judgeVariant({ sent: 200, claims: 10 }, { sent: 200, claims: 30 }).z).toBeCloseTo(3.3333, 3)
  })
})

describe('equal halves by a stable hash, no person choosing', () => {
  test('the same contact always falls in the same half', () => {
    expect(halfOf('a1b2c3d4-0000-4000-8000-000000000001')).toBe(halfOf('a1b2c3d4-0000-4000-8000-000000000001'))
  })

  test('over many contacts the halves are close to equal', () => {
    let a = 0
    for (let i = 0; i < 10_000; i++) if (halfOf(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) === 'a') a++
    expect(Math.abs(a - 5_000)).toBeLessThan(300)
  })
})
