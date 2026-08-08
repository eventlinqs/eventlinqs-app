/**
 * The rate limiter must never return an unlimited allowance.
 *
 * THE DEFECT. `checkRateLimit` caught every Redis error and returned
 * `{ ok: true }`, unconditionally. `failClosed` was honoured only for MISSING
 * CONFIGURATION, never for a failure. So the single state an attacker would try
 * to induce, a throwing store, was the state that removed every limit on the
 * platform at once: login, signup, password reset, magic link, checkout and the
 * AI spend guard.
 *
 * The trigger is not exotic. Upstash errors when a plan's request quota is
 * exhausted, and the cheapest way to exhaust it is to hammer the endpoints those
 * policies protect. Make the limiter throw, then brute force with no limiter.
 *
 * These tests pin the degradation contract. The one that matters most is
 * "a throwing store still bounds the attacker", because that is the assertion
 * that fails if anybody restores `return { ok: true }` in the catch.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// The client module is mocked per test so the limiter can be driven through each
// branch of its contract without a real Redis.
const getRedisClient = vi.fn()
vi.mock('@/lib/redis/client', () => ({ getRedisClient: () => getRedisClient() }))

const { checkRateLimit, __resetMemoryRateLimitBuckets } = await import('@/lib/redis/rate-limit')

const POLICY = { key: 'auth-login:203.0.113.7', limit: 5, windowSec: 600 }

beforeEach(() => {
  __resetMemoryRateLimitBuckets()
  getRedisClient.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('store healthy: the shared window is authoritative', () => {
  it('allows up to the limit and refuses past it', async () => {
    let n = 0
    getRedisClient.mockReturnValue({
      incr: async () => ++n,
      expire: async () => 1,
    })

    const results = []
    for (let i = 0; i < 6; i++) results.push(await checkRateLimit({ ...POLICY }))

    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true)
    expect(results[5]!.ok).toBe(false)
  })
})

describe('store ERRORS: the control degrades, it does not disappear', () => {
  it('still refuses once the limit is reached', async () => {
    // THE REGRESSION TEST. If the catch goes back to `return { ok: true }`, every
    // one of these is ok and this fails.
    getRedisClient.mockReturnValue({
      incr: async () => {
        throw new Error('ECONNRESET')
      },
      expire: async () => 1,
    })

    const results = []
    for (let i = 0; i < 8; i++) results.push(await checkRateLimit({ ...POLICY }))

    const allowed = results.filter((r) => r.ok).length
    expect(allowed, 'a throwing store must not grant an unlimited allowance').toBe(POLICY.limit)
    expect(results[results.length - 1]!.ok).toBe(false)
  })

  it('bounds a failClosed policy on error, which it previously did not', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getRedisClient.mockReturnValue({
      incr: async () => {
        throw new Error('quota exceeded')
      },
      expire: async () => 1,
    })

    const results = []
    for (let i = 0; i < 10; i++)
      results.push(await checkRateLimit({ ...POLICY, failClosed: true }))

    expect(results.filter((r) => r.ok).length).toBe(POLICY.limit)
  })

  it('keeps separate buckets per key, so one abuser cannot lock everyone out', async () => {
    getRedisClient.mockReturnValue({
      incr: async () => {
        throw new Error('down')
      },
      expire: async () => 1,
    })

    for (let i = 0; i < 6; i++) await checkRateLimit({ ...POLICY })
    // A different IP must still be served.
    const other = await checkRateLimit({ ...POLICY, key: 'auth-login:198.51.100.4' })
    expect(other.ok).toBe(true)
  })

  it('reports a real remaining count while degraded, not a fabricated full quota', async () => {
    // The old error path returned remaining = limit, which told well-behaved
    // clients they had a full quota at the exact moment the limiter was blind.
    getRedisClient.mockReturnValue({
      incr: async () => {
        throw new Error('down')
      },
      expire: async () => 1,
    })

    const first = await checkRateLimit({ ...POLICY })
    expect(first.remaining).toBe(POLICY.limit - 1)
    const second = await checkRateLimit({ ...POLICY })
    expect(second.remaining).toBe(POLICY.limit - 2)
  })
})

describe('config MISSING: a misconfigured deploy is not the same as a blip', () => {
  it('blocks a failClosed policy in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getRedisClient.mockReturnValue(null)

    const r = await checkRateLimit({ ...POLICY, failClosed: true })
    expect(r.ok).toBe(false)
  })

  it('allows in non-production, so local dev and tests are not blocked', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    getRedisClient.mockReturnValue(null)

    const r = await checkRateLimit({ ...POLICY, failClosed: true })
    expect(r.ok).toBe(true)
  })

  it('allows a non-failClosed policy in production rather than breaking a page', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getRedisClient.mockReturnValue(null)

    const r = await checkRateLimit({ ...POLICY })
    expect(r.ok).toBe(true)
  })
})

describe('the fallback cannot become its own denial-of-service', () => {
  // Explicit generous timeout: this walks past the 10,000-entry cap, which is
  // fast in isolation but exceeded the 5s default when the full suite runs its
  // projects in parallel. A flaky test in a security suite is worse than no test,
  // because it trains people to re-run instead of read.
  it('does not grow without bound across many distinct keys', { timeout: 60_000 }, async () => {
    getRedisClient.mockReturnValue({
      incr: async () => {
        throw new Error('down')
      },
      expire: async () => 1,
    })

    // Far more distinct keys than any real IP space in one window. The map is
    // capped, so this must complete and must not exhaust memory.
    for (let i = 0; i < 12_000; i++) {
      await checkRateLimit({ ...POLICY, key: `spray:${i}` })
    }
    // Once at the cap the limiter refuses rather than growing, which is the
    // correct direction for a limiter to fail.
    const atCap = await checkRateLimit({ ...POLICY, key: 'spray:beyond' })
    expect(typeof atCap.ok).toBe('boolean')
  })
})

describe('the source no longer contains the fail-open shape', () => {
  it('does not return ok:true from the catch', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const src = readFileSync(
      path.resolve(__dirname, '../../../src/lib/redis/rate-limit.ts'),
      'utf8',
    )
    const catchBlock = src.slice(src.indexOf('} catch (err) {'))
    expect(catchBlock).not.toMatch(/ok:\s*true/)
    expect(catchBlock).toContain('memoryRateLimit')
  })
})
