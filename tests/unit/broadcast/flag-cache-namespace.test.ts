import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * THE DEFECT. The feature-flag cache key was `ff:v1:<flag>`, with no
 * environment in it, while the Upstash credentials live in `.env.local` and the
 * database credentials do not. Any process pointed at a different database,
 * including a developer running locally against TEST, wrote ITS flag values
 * into the SAME Redis that production reads.
 *
 * Measured on 8 August 2026: a local server reading TEST left
 * `ff:v1:broadcast_artists = "true"` in the shared cache while the production
 * row for that flag is `false`. The 30 second TTL bounded it and no production
 * behaviour change was observed, but for up to 30 seconds production could have
 * served a stage nobody had enabled.
 *
 * A feature flag is the one thing that must never be ambiguous about which
 * environment it belongs to, so the key now carries the Supabase project ref.
 */
describe('feature flag cache namespacing', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL
    vi.resetModules()
  })

  /**
   * The key is private, so it is observed through the one place it is
   * unambiguously visible: the Redis client the resolver talks to.
   */
  async function keyUsedFor(supabaseUrl: string, flag: 'broadcast_artists'): Promise<string> {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
    const seen: string[] = []
    vi.doMock('@/lib/redis/client', () => ({
      getRedisClient: () => ({
        get: async (key: string) => {
          seen.push(key)
          return null
        },
        set: async () => undefined,
        del: async () => undefined,
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      }),
    }))
    const { isFeatureEnabled } = await import('@/lib/flags/broadcast')
    await isFeatureEnabled(flag)
    return seen[0] ?? ''
  }

  it('puts the TEST project ref in the key', async () => {
    const key = await keyUsedFor('https://vkapkibzokmfaxqogypq.supabase.co', 'broadcast_artists')
    expect(key).toContain('vkapkibzokmfaxqogypq')
    expect(key).toContain('broadcast_artists')
  })

  it('puts the production project ref in the key', async () => {
    const key = await keyUsedFor('https://gndnldyfudbytbboxesk.supabase.co', 'broadcast_artists')
    expect(key).toContain('gndnldyfudbytbboxesk')
  })

  it('gives TEST and production DIFFERENT keys for the same flag', async () => {
    // This is the whole assertion. If these two are ever equal again, a local
    // developer can switch a production stage on for the length of a TTL.
    const test = await keyUsedFor('https://vkapkibzokmfaxqogypq.supabase.co', 'broadcast_artists')
    const prod = await keyUsedFor('https://gndnldyfudbytbboxesk.supabase.co', 'broadcast_artists')
    expect(test).not.toBe(prod)
  })

  it('degrades to a named fallback rather than throwing when the URL is absent', async () => {
    const key = await keyUsedFor('', 'broadcast_artists')
    expect(key).toContain('unknown')
    expect(key).toContain('broadcast_artists')
  })

  it('does not reuse the old unnamespaced v1 key', async () => {
    // The v1 keys hold values written by whichever environment last touched
    // them. Bumping the version means nothing inherits that history.
    const key = await keyUsedFor('https://vkapkibzokmfaxqogypq.supabase.co', 'broadcast_artists')
    expect(key).not.toBe('ff:v1:broadcast_artists')
  })
})
