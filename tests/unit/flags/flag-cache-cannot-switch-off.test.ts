/**
 * THE FLAG CACHE MUST NEVER BE ABLE TO DECIDE A FEATURE IS OFF.
 *
 * WHY THIS EXISTS, found 29 August 2026 while driving the Launch Kit.
 *
 * /api/organiser/events/[id]/poster answered 404 feature_off on THREE RUNS OUT
 * OF FOUR while the feature_flags row said broadcast_share was ON and the
 * cached value read back as "true". Deleting the cache key before each request
 * made it 200 four times out of four. The organiser's printable A4 poster, the
 * artefact this platform is sold on, was being switched off by its own cache.
 *
 * The cause was one line in readCache:
 *
 *     return raw === 'true'
 *
 * which collapsed EVERY unrecognised value to false and handed it back as a
 * DECISION, so isFeatureEnabled returned false without ever asking the
 * database. Nothing was logged, because nothing had failed as far as the code
 * was concerned.
 *
 * THE ASYMMETRY IS THE POINT, and it is what these tests pin. A database error
 * already falls back to BROADCAST_FLAG_DEFAULTS, and for broadcast_share that
 * default is ON. So the two failure paths for the SAME question had opposite
 * postures: an unreachable database left the feature on, an unrecognised cache
 * value turned it off. A cache is an optimisation. It may answer "yes", it may
 * answer "no", and it must be able to answer "I do not know" - but it must
 * never turn "I do not know" into "no".
 */
import { describe, expect, test, vi, beforeEach } from 'vitest'

let cached: unknown = null
let dbReads = 0

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

vi.mock('@/lib/redis/client', () => ({
  getRedisClient: () => ({
    get: async () => cached,
    set: async () => 'OK',
    del: async () => 1,
  }),
}))

import { isFeatureEnabled, type FlagReadClient } from '@/lib/flags/broadcast'

function clientReturning(enabled: boolean) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            dbReads += 1
            return { data: { flag: 'broadcast_share', enabled }, error: null }
          },
        }),
      }),
    }),
  } as unknown as FlagReadClient
}

beforeEach(() => {
  cached = null
  dbReads = 0
})

describe('the feature flag cache', () => {
  test('a cached "true" is honoured without touching the database', async () => {
    cached = 'true'
    expect(await isFeatureEnabled('broadcast_share', { client: clientReturning(false) })).toBe(true)
    expect(dbReads, 'a usable cache hit must not read the database').toBe(0)
  })

  test('a cached "false" is honoured, because turning a feature OFF is a real cached answer', async () => {
    cached = 'false'
    expect(await isFeatureEnabled('broadcast_share', { client: clientReturning(true) })).toBe(false)
    expect(dbReads).toBe(0)
  })

  test('a cached boolean is honoured in both directions', async () => {
    cached = true
    expect(await isFeatureEnabled('broadcast_share', { client: clientReturning(false) })).toBe(true)
    cached = false
    expect(await isFeatureEnabled('broadcast_share', { client: clientReturning(true) })).toBe(false)
    expect(dbReads).toBe(0)
  })

  test('a MISS falls through to the database', async () => {
    cached = null
    expect(await isFeatureEnabled('broadcast_share', { client: clientReturning(true) })).toBe(true)
    expect(dbReads).toBe(1)
  })

  /*
   * THE REGRESSION ITSELF. Every one of these is a value the cache could hand
   * back that is not a yes and not a no, and the old reader turned each of them
   * into a no. They are the shapes a real store actually produces: a
   * double-encoded write, a value from an older serialisation, an OK echoed
   * from a write path, a number, an empty string, an object.
   */
  const NONSENSE: [string, unknown][] = [
    ['a double-encoded true', '"true"'],
    ['a value from another serialisation', 'TRUE'],
    ['an OK echoed back', 'OK'],
    ['a number', 1],
    ['a zero', 0],
    ['an empty string', ''],
    ['an object', { enabled: true }],
    ['an array', ['true']],
  ]

  test.each(NONSENSE)(
    'an unrecognised cached value (%s) asks the database instead of answering OFF',
    async (_label, value) => {
      cached = value
      expect(
        await isFeatureEnabled('broadcast_share', { client: clientReturning(true) }),
        'an unreadable cache must never be able to switch a feature off',
      ).toBe(true)
      expect(dbReads, 'it must have consulted the database rather than deciding').toBe(1)
    },
  )

  test('an unrecognised cached value cannot switch a feature ON either: the database still decides', async () => {
    cached = 'OK'
    expect(await isFeatureEnabled('broadcast_share', { client: clientReturning(false) })).toBe(false)
    expect(dbReads).toBe(1)
  })
})
