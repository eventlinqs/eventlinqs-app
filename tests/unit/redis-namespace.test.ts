import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * THE DEFECT, measured 8 August 2026.
 *
 * A local dev server pointed at the TEST database wrote TEST values into the
 * Redis that PRODUCTION reads:
 *
 *     ff:v1:broadcast_artists = "true"     (production's row says false)
 *
 * The keys carried no environment. The Upstash credentials live in `.env.local`
 * and the database credentials that would have redirected them do not, so any
 * process pointed at another database shared production's store.
 *
 * Namespacing that one key would have fixed one instance and left the cause.
 * Five more key families had the identical shape, and two are far worse than a
 * feature flag: `pr:v2:*` caches the resolved FEE and is returned before the
 * database is consulted, and `ai:spend:*` is one global monthly budget counter
 * whose exhaustion disables the AI features.
 *
 * So the namespace lives in the CLIENT and these tests assert it there.
 */
describe('redis key namespacing', () => {
  const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const ORIGINAL_UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
  const ORIGINAL_UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

  beforeEach(() => {
    vi.resetModules()
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL
    process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_UPSTASH_URL
    process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_UPSTASH_TOKEN
    vi.resetModules()
  })

  const TEST_REF = 'vkapkibzokmfaxqogypq'
  const PROD_REF = 'gndnldyfudbytbboxesk'

  async function keyModule(supabaseUrl: string) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
    vi.resetModules()
    return import('@/lib/redis/client')
  }

  describe('the namespace itself', () => {
    it('is the TEST project ref when pointed at TEST', async () => {
      const { namespacedKey } = await keyModule(`https://${TEST_REF}.supabase.co`)
      expect(namespacedKey('ff:v2:broadcast_artists')).toBe(`${TEST_REF}:ff:v2:broadcast_artists`)
    })

    it('is the production project ref when pointed at production', async () => {
      const { namespacedKey } = await keyModule(`https://${PROD_REF}.supabase.co`)
      expect(namespacedKey('ff:v2:broadcast_artists')).toBe(`${PROD_REF}:ff:v2:broadcast_artists`)
    })

    it('THE ASSERTION: TEST and production never produce the same key', async () => {
      // If these are ever equal again, a local developer can switch a
      // production stage on, or serve a TEST fee as production's fee.
      const test = (await keyModule(`https://${TEST_REF}.supabase.co`)).namespacedKey('pr:v2:platform_fee:AU:AUD:null')
      const prod = (await keyModule(`https://${PROD_REF}.supabase.co`)).namespacedKey('pr:v2:platform_fee:AU:AUD:null')
      expect(test).not.toBe(prod)
    })

    it('degrades to a named fallback rather than throwing', async () => {
      const { namespacedKey } = await keyModule('')
      expect(namespacedKey('ai:spend:2026-08')).toBe('unknown:ai:spend:2026-08')
    })
  })

  describe('the client applies it to every key-taking method', () => {
    /** Capture what the underlying Upstash client actually received. */
    async function callsFor(supabaseUrl: string) {
      const calls: { method: string; args: unknown[] }[] = []
      vi.doMock('@upstash/redis', () => ({
        Redis: class {
          get(...args: unknown[]) { calls.push({ method: 'get', args }); return null }
          set(...args: unknown[]) { calls.push({ method: 'set', args }); return 'OK' }
          del(...args: unknown[]) { calls.push({ method: 'del', args }); return 1 }
          incrby(...args: unknown[]) { calls.push({ method: 'incrby', args }); return 1 }
          expire(...args: unknown[]) { calls.push({ method: 'expire', args }); return 1 }
          ping(...args: unknown[]) { calls.push({ method: 'ping', args }); return 'PONG' }
          scriptLoad(...args: unknown[]) { calls.push({ method: 'scriptLoad', args }); return 'x' }
        },
      }))
      process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
      vi.resetModules()
      const { getRedisClient } = await import('@/lib/redis/client')
      return { redis: getRedisClient()!, calls }
    }

    it('namespaces get, set, incrby and expire', async () => {
      const { redis, calls } = await callsFor(`https://${TEST_REF}.supabase.co`)
      await redis.get('ff:v2:broadcast_follow')
      await redis.set('pr:v2:platform_fee:AU:AUD:null', '{}')
      await redis.incrby('ai:spend:2026-08', 5)
      await redis.expire('rl:login:123', 60)
      expect(calls.map((c) => c.args[0])).toEqual([
        `${TEST_REF}:ff:v2:broadcast_follow`,
        `${TEST_REF}:pr:v2:platform_fee:AU:AUD:null`,
        `${TEST_REF}:ai:spend:2026-08`,
        `${TEST_REF}:rl:login:123`,
      ])
    })

    it('namespaces EVERY key del is given, not just the first', async () => {
      const { redis, calls } = await callsFor(`https://${TEST_REF}.supabase.co`)
      await redis.del('a:1', 'b:2', 'c:3')
      expect(calls[0].args).toEqual([`${TEST_REF}:a:1`, `${TEST_REF}:b:2`, `${TEST_REF}:c:3`])
    })

    it('leaves non-key arguments alone', async () => {
      const { redis, calls } = await callsFor(`https://${TEST_REF}.supabase.co`)
      await redis.set('k', 'a-string-value', { ex: 30 })
      expect(calls[0].args[1]).toBe('a-string-value')
      expect(calls[0].args[2]).toEqual({ ex: 30 })
    })

    it('passes keyless methods straight through', async () => {
      const { redis, calls } = await callsFor(`https://${TEST_REF}.supabase.co`)
      await redis.ping()
      expect(calls[0]).toEqual({ method: 'ping', args: [] })
    })

    it('REFUSES an unclassified method rather than writing an unnamespaced key', async () => {
      // The load-bearing guard. A silent pass-through would let the next
      // Upstash method somebody reaches for reintroduce the exact defect this
      // wrapper closes, invisibly.
      const { redis } = await callsFor(`https://${TEST_REF}.supabase.co`)
      expect(() => (redis as unknown as { scriptLoad: () => void }).scriptLoad()).toThrow(
        /not classified/,
      )
    })
  })
})
