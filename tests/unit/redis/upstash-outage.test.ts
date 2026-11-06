// WHAT PRODUCTION DOES WHEN UPSTASH STOPS ANSWERING (the CONTROLLER's 21:54 of 6 November 2026, after a failed Upstash card
// charge: a suspended account, a wrong token, a timeout). Driven through the INSTALLED @upstash/redis against a local server,
// never a mock of the SDK, because what decides it is what the library does on the wire.
//
//   a suspended account or a wrong token: Upstash answers with an error; every limiter degrades to the per-instance window
//   (src/lib/redis/rate-limit.ts), bounded, never a 500 and never unlimited.
//   a timeout: Upstash takes the connection and never answers. Before this test the client had no time limit, so every
//   limiter call, and the proxy and checkout actions behind it, waited until the platform killed the function. Every request
//   is now bounded (src/lib/redis/client.ts REDIS_REQUEST_TIMEOUT_MS) and its abort is a store error like any other.
//   no configuration: a fail closed policy refuses in production ('store-unavailable'), as the doctrine rules.

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { getRedisClient, resetRedisClientForTests, REDIS_REQUEST_TIMEOUT_MS } from '@/lib/redis/client'
import { __resetMemoryRateLimitBuckets, checkRateLimit } from '@/lib/redis/rate-limit'

let refuses: Server
let hangs: Server
const held: import('node:http').ServerResponse[] = []
const urlOf = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`

beforeAll(async () => {
  // A suspended account or a wrong token: Upstash answers 401 with an error body.
  refuses = createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'WRONGPASS invalid or missing auth token' }))
  })
  // Upstash unreachable behind an open connection: the request is taken and never answered.
  hangs = createServer((_req, res) => {
    held.push(res)
  })
  await Promise.all([refuses, hangs].map((s) => new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))))
})

afterAll(async () => {
  for (const res of held) res.destroy()
  await Promise.all([refuses, hangs].map((s) => new Promise<void>((r) => s.close(() => r()))))
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetRedisClientForTests()
  __resetMemoryRateLimitBuckets()
})

const point = (server: Server) => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', urlOf(server))
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  resetRedisClientForTests()
}
const timed = async <T,>(f: () => Promise<T>) => {
  const t = Date.now()
  const value = await f()
  return { value, ms: Date.now() - t }
}
const policy = { key: 'checkout-reserve:203.0.113.9', limit: 3, windowSec: 60, failClosed: true }

describe('Upstash answers with an error (a suspended account, a wrong token)', () => {
  test('a fail closed limiter degrades to the per-instance window: allowed, then refused past its limit, never a 500', async () => {
    point(refuses)
    const results = []
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(policy))
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false])
    expect(results[3].reason).toBeUndefined()
  })
})

describe('Upstash never answers (a timeout)', () => {
  test('every request is bounded, so a limiter answers from the per-instance window within the bound', async () => {
    point(hangs)
    const { value, ms } = await timed(() => checkRateLimit(policy))
    expect(value.ok).toBe(true)
    expect(ms).toBeLessThan(REDIS_REQUEST_TIMEOUT_MS + 1000)
  }, 15_000)

  test('a raw call through the client rejects within the bound, so every caller reads it as a store error', async () => {
    point(hangs)
    const t = Date.now()
    await expect(getRedisClient()!.get('anything')).rejects.toBeTruthy()
    expect(Date.now() - t).toBeLessThan(REDIS_REQUEST_TIMEOUT_MS + 1000)
  }, 15_000)
})

describe('no Upstash configuration', () => {
  test('a fail closed policy refuses in production, saying the store is unavailable, and a fail open one allows', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'production')
    resetRedisClientForTests()
    expect(await checkRateLimit(policy)).toMatchObject({ ok: false, reason: 'store-unavailable', resetMs: 0 })
    expect((await checkRateLimit({ ...policy, failClosed: false })).ok).toBe(true)
  })
})

describe('no visitor path calls the store outside a degrading path', () => {
  test("the queue's join limit goes through the shared limiter, never a raw incr that throws when Upstash fails", () => {
    const queue = readFileSync('src/app/actions/queue.ts', 'utf8')
    expect(queue).not.toMatch(/redis\.incr\(/)
    expect(queue).toMatch(/checkRateLimit\(/)
  })
})
