/**
 * THE OWNER'S THRESHOLD, AND THE FALLBACK THAT LETS THIS SHIP BEFORE HIS MIGRATION.
 *
 * SEO3 step 2: "The threshold is a single configuration value the owner can
 * change without a deploy."
 *
 * The value lives in `public.seo_settings`, created by the migration waiting at
 * docs/migrations-pending/20260914000001_seo_settings.sql. Applying a migration to production is the
 * founder's reserved step and merging code is not, so the resolver has to be
 * correct in THREE states, not one: before the table exists, after it exists,
 * and when the database cannot be reached at all. Those three are what this file
 * holds, because the third is the one that decides whether a bad minute on
 * Supabase de-indexes the platform.
 *
 * THE DIRECTION OF THE FALLBACK IS THE POINT. A failed read must never read as
 * ZERO, because zero would make every templated discovery page indexable at
 * once, which is the opposite of the safe direction and is the exact shape
 * Google collapsed in close-out C19. It degrades to the compiled constant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { DISCOVERY_INDEXING_THRESHOLD } from '@/lib/seo/indexing-policy'

/** The shape of the one query the resolver makes, stubbed at the client. */
function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  }
}

/** The client the resolver reaches for, replaced per test. */
const publicClient = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/lib/supabase/public-client', () => ({
  createPublicClient: () => {
    if (publicClient.current === null) throw new Error('relation "public.seo_settings" does not exist')
    return publicClient.current
  },
}))

async function resolveWith(client: unknown) {
  publicClient.current = client
  const mod = await import('@/lib/seo/discovery-threshold')
  mod.resetDiscoveryThresholdCache()
  return mod.resolveDiscoveryThreshold()
}

beforeEach(() => {
  vi.resetModules()
  publicClient.current = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the discovery threshold the owner controls', () => {
  it('returns the row the owner set, so the number moves with no deploy', async () => {
    expect(await resolveWith(clientReturning({ data: { value_int: 7 }, error: null }))).toBe(7)
  })

  it('returns the code constant when the settings table does not exist yet', async () => {
    /*
     * THE STATE THIS COMMIT SHIPS IN. The migration is written and the founder
     * has not applied it. The platform must behave exactly as it did before, so
     * merging this does not depend on his step and his step changes nothing on
     * the day he takes it.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await resolveWith(null)).toBe(DISCOVERY_INDEXING_THRESHOLD)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('seo_settings unreadable')
  })

  it('returns the code constant when the read errors, never zero', async () => {
    // Zero would index every templated page at once. The fallback direction is
    // the difference between a bad minute on Supabase and a de-indexing event.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = await resolveWith(
      clientReturning({ data: null, error: { message: 'connection terminated' } }),
    )
    expect(value).toBe(DISCOVERY_INDEXING_THRESHOLD)
    expect(value).toBeGreaterThan(0)
  })

  it('returns the code constant when no row has been written', async () => {
    expect(await resolveWith(clientReturning({ data: null, error: null }))).toBe(
      DISCOVERY_INDEXING_THRESHOLD,
    )
  })

  it.each([
    ['negative, which would index everything', -1],
    ['above the sane ceiling', 1001],
    ['not an integer', 2.5],
    ['not a number at all', 'three'],
    ['null', null],
  ])('ignores a value that is %s and falls back', async (_label, value_int) => {
    /*
     * BOUNDS ARE APPLIED IN THE RESOLVER AS WELL AS IN THE MIGRATION'S CHECK
     * CONSTRAINT, because the service role bypasses RLS and a future admin write
     * could put anything in the row. A negative threshold indexes everything and
     * a NaN compares false against every count and indexes nothing; both are
     * worse than the constant.
     */
    expect(await resolveWith(clientReturning({ data: { value_int }, error: null }))).toBe(
      DISCOVERY_INDEXING_THRESHOLD,
    )
  })

  it('accepts zero, because zero is a real instruction and not a failure', async () => {
    // "Index every discovery page regardless of how empty it is" is a thing the
    // owner may legitimately want, and it is distinguishable from a failed read
    // only because a failed read returns the CONSTANT rather than zero.
    expect(await resolveWith(clientReturning({ data: { value_int: 0 }, error: null }))).toBe(0)
  })

  it('caches within the process, and the cache can be cleared', async () => {
    const mod = await import('@/lib/seo/discovery-threshold')
    publicClient.current = clientReturning({ data: { value_int: 4 }, error: null })
    mod.resetDiscoveryThresholdCache()
    expect(await mod.resolveDiscoveryThreshold()).toBe(4)

    // The row changes, but within the window the resolved value does not, which
    // is what stops one sitemap request making 490 identical round trips.
    publicClient.current = clientReturning({ data: { value_int: 9 }, error: null })
    expect(await mod.resolveDiscoveryThreshold()).toBe(4)

    mod.resetDiscoveryThresholdCache()
    expect(await mod.resolveDiscoveryThreshold()).toBe(9)
  })

  it('hands the page the same number it hands the sitemap', async () => {
    /*
     * The contradiction this whole design exists to prevent: a page rendering
     * noindex while the sitemap publishes the URL. Both come through this
     * resolver, so the page's metadata block and the sitemap's gate are computed
     * from one value.
     */
    const mod = await import('@/lib/seo/discovery-threshold')
    const policy = await import('@/lib/seo/indexing-policy')
    publicClient.current = clientReturning({ data: { value_int: 5 }, error: null })
    mod.resetDiscoveryThresholdCache()

    const pageBlock = await mod.discoveryIndexingFor(4, '/city/melbourne')
    const sitemapSays = policy.isDiscoveryIndexable(4, await mod.resolveDiscoveryThreshold())
    expect(pageBlock.robots.index).toBe(false)
    expect(sitemapSays).toBe(false)

    const pageBlockFull = await mod.discoveryIndexingFor(5, '/city/melbourne')
    expect(pageBlockFull.robots.index).toBe(true)
    expect(policy.isDiscoveryIndexable(5, await mod.resolveDiscoveryThreshold())).toBe(true)

    // Self-canonical in both states, which is the C19 rule this must not lose.
    expect(pageBlock.alternates.canonical).toBe('/city/melbourne')
    expect(pageBlockFull.alternates.canonical).toBe('/city/melbourne')
  })
})
