import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A HOST WITH NO SERVICE-ROLE KEY READS NO GUIDE CITY, AND NEVER THROWS
 * (WI2 Part 2, #186). The CI build job carries only NEXT_PUBLIC values;
 * createAdminClient threw "supabaseKey is required" inside readGuideCities and
 * failed /sitemap.xml's prerender. The rule is fetchPublicEventsCached's.
 */
describe('the city guide surface on a host with no service-role key', () => {
  const saved = {
    a: process.env.SUPABASE_SERVICE_ROLE_KEY,
    b: process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }

  beforeEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
    // The CI build job's own shape: the public URL present, the key absent.
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url ?? 'https://vkapkibzokmfaxqogypq.supabase.co'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    if (saved.a === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.a
    if (saved.b === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
    else process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW = saved.b
    if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    vi.restoreAllMocks()
  })

  it('offers no guide city instead of throwing, so the sitemap still builds', async () => {
    const { readGuideCities } = await import('@/lib/listings/free-week-surface')
    await expect(readGuideCities()).resolves.toEqual([])
  })

  it('finds no guide city by slug, so a city page leaves its week link off', async () => {
    const { readGuideCity } = await import('@/lib/listings/free-week-surface')
    await expect(readGuideCity('melbourne')).resolves.toBeNull()
  })
})
