/**
 * THE SEAT COUNT THE EVENT PAGE READS HAD A TAG NOBODY CLEARED.
 *
 * `getTierInventoryStatic` and `getEventInventoryStatic` are what
 * /events/[slug] reads to decide between "N left" and "Sold out". Both are
 * `unstable_cache` entries tagged `inventory`, and until 25 August 2026 nothing
 * in the repository ever passed that tag to revalidateTag, updateTag or
 * expireTag. The only thing that expired it was its own 30 second timer.
 *
 * Both call sites already called `refreshInventoryCache` faithfully after a
 * reservation and after a Stripe payment. It cleared Redis and left the Next
 * data cache alone, so the public page kept the pre-sale count for up to the
 * full window after a seat was taken.
 *
 * TWO THINGS ARE PINNED HERE, and the second is the one that is easy to lose in
 * a later refactor:
 *
 *   1. the tag is cleared at all;
 *   2. it is cleared BEFORE the first await. Both callers invoke this
 *      fire-and-forget with no await, so anything after the first await runs
 *      outside the request store that `revalidateTag` needs. Moved to the bottom
 *      of the function it would throw into the caller's `.catch` and clear
 *      nothing, while every log line still read as success.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const revalidateTag = vi.fn()
const order: string[] = []

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: (tag: string, profile: unknown) => {
    order.push('revalidateTag')
    revalidateTag(tag, profile)
  },
}))

vi.mock('@/lib/redis/client', () => ({
  getRedisClient: () => ({
    get: async () => {
      order.push('redis.get')
      return null
    },
    set: async () => {
      order.push('redis.set')
    },
    del: async () => {
      order.push('redis.del')
    },
  }),
}))

vi.mock('@/lib/supabase/public-client', () => ({
  createPublicClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { sold_count: 1, reserved_count: 0, total_capacity: 10 }, error: null }),
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}))

const { refreshInventoryCache, INVENTORY_CACHE_TAG } = await import('@/lib/redis/inventory-cache')

describe('refreshInventoryCache clears the Next data cache, not only Redis', () => {
  beforeEach(() => {
    revalidateTag.mockClear()
    order.length = 0
  })

  it('names the same tag the cached readers declare', async () => {
    await refreshInventoryCache('tier-1', 'event-1')
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith(INVENTORY_CACHE_TAG, { expire: 0 })
  })

  it('expires immediately rather than stale-while-revalidate', async () => {
    // The default "max" profile serves the stale value once more while it
    // refreshes. For a seat that has just been taken, serving it once more is
    // the failure, not a small delay.
    await refreshInventoryCache('tier-1', 'event-1')
    const [, profile] = revalidateTag.mock.calls[0]
    expect(profile).toEqual({ expire: 0 })
  })

  it('clears the tag BEFORE any await, so it runs inside the caller request store', async () => {
    await refreshInventoryCache('tier-1', 'event-1')
    expect(order.length).toBeGreaterThan(1)
    expect(order[0]).toBe('revalidateTag')
  })
})
