// Fail-closed rate-limit proof.
//
// When Upstash is not configured (getRedisClient returns null), the limiter
// fails OPEN by default (availability over strictness). For the abuse-sensitive
// auth/checkout policies it must instead fail CLOSED in production, so a deploy
// that forgot UPSTASH_REDIS_REST_URL/_TOKEN cannot run those paths unprotected.
// Local dev and tests (no Upstash) must still pass.

import { afterEach, describe, expect, test, vi } from 'vitest'

// No Upstash configured: the client is always null in this suite.
vi.mock('@/lib/redis/client', () => ({ getRedisClient: () => null }))

import { checkRateLimit } from '@/lib/redis/rate-limit'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkRateLimit fail-closed on missing config', () => {
  test('failClosed policy BLOCKS in production when Upstash is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const r = await checkRateLimit({ key: 'co-res:1.2.3.4', limit: 20, windowSec: 60, failClosed: true })
    expect(r.ok).toBe(false)
  })

  test('failClosed policy ALLOWS outside production (local/dev/test)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const r = await checkRateLimit({ key: 'co-res:1.2.3.4', limit: 20, windowSec: 60, failClosed: true })
    expect(r.ok).toBe(true)
  })

  test('a non-failClosed policy still fails OPEN in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const r = await checkRateLimit({ key: 'h-redis:1.2.3.4', limit: 60, windowSec: 60 })
    expect(r.ok).toBe(true)
  })
})
