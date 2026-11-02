import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/*
 * A CACHED PAGE READS ITS FLAG WITHOUT REDIS (round 3's speed half of item 0; the CONTROLLER's 01:12). On live, / and every
 * /city/[slug] answered 'X-Vercel-Cache: MISS, Age: 0' on every read: the guide read the claims flag through Upstash, whose
 * client fetches with cache 'no-store' (node_modules/@upstash/redis/nodejs.js), and a no-store fetch in the render opts
 * the page out of the cache. With { cachedPage: true } the flag is read from the table through the client given (the
 * public client: feature_flags has a public SELECT policy) and Redis is neither read nor written.
 */
const redisGet = vi.fn()
const redisSet = vi.fn()
vi.mock('@/lib/redis/client', () => ({ getRedisClient: () => ({ get: redisGet, set: redisSet }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no admin client on a cached page') } }))

import { isFeatureEnabled } from '@/lib/flags/broadcast'

const client = (enabled: boolean) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { flag: 'listing_claims', enabled }, error: null }) }) }) }) }) as never

describe('isFeatureEnabled on a cached page', () => {
  it('reads the table through the client given and never touches Redis', async () => {
    redisGet.mockClear()
    redisSet.mockClear()
    expect(await isFeatureEnabled('listing_claims', { client: client(false), cachedPage: true })).toBe(false)
    expect(await isFeatureEnabled('listing_claims', { client: client(true), cachedPage: true })).toBe(true)
    expect(redisGet).not.toHaveBeenCalled()
    expect(redisSet).not.toHaveBeenCalled()
  })

  it('the city guide reads its one flag that way, through the public client', () => {
    const s = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide-screen.tsx'), 'utf8')
    expect(s).toMatch(/isFeatureEnabled\('listing_claims', \{ client: createPublicClient\(\), cachedPage: true \}\)/)
  })
})
