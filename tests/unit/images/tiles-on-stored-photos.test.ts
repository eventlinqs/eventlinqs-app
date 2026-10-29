import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

/*
 * EVERY SLOT TILE ON A STORED PHOTOGRAPH (Lawal, 22:17 and 22:23 on 29 October 2026). On production the African
 * community card, the Communities doorway and the Comedy tile showed no photograph: they asked Pexels at request time,
 * and a refusal was cached for a week. These hold the fix: every community route and every real category resolves
 * with no network call at all, and a refused answer is never kept.
 */

// unstable_cache as Next keeps it: a resolved value is stored, a rejection is not.
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => {
    const kept = new Map<string, R>()
    return async (...a: A) => {
      const key = JSON.stringify(a)
      if (kept.has(key)) return kept.get(key) as R
      const value = await fn(...a)
      kept.set(key, value)
      return value
    }
  },
}))
vi.mock('@/lib/observability/sentry', () => ({ captureException: () => undefined }))

const COMMUNITY_ROUTES = [
  'aboriginal-torres-strait-islander', 'african', 'caribbean', 'indian', 'chinese', 'filipino', 'latin-american', 'vietnamese',
  'lebanese-levantine', 'greek', 'italian', 'korean', 'japanese', 'pacific-pasifika', 'maori', 'persian-iranian', 'turkish', 'arab',
  'other-south-asian', 'other-east-southeast-asian', 'other-european',
]
// Every category on production, read 29 October 2026.
const REAL_CATEGORIES = [
  'arts-community', 'business-networking', 'charity', 'comedy', 'community', 'education', 'european', 'family', 'fashion', 'festival', 'film',
  'food-drink', 'health-wellness', 'middle-eastern', 'music', 'nightlife', 'other', 'pacific', 'pride', 'religion', 'sports', 'technology',
]

let community: typeof import('@/lib/images/community-photo')
let category: typeof import('@/lib/images/category-photo')
const fetchSpy = vi.fn()

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://gndnldyfudbytbboxesk.supabase.co')
  vi.stubEnv('PEXELS_API_KEY', 'test-key-not-real')
  vi.stubGlobal('fetch', fetchSpy)
  community = await import('@/lib/images/community-photo')
  category = await import('@/lib/images/category-photo')
})
afterEach(() => fetchSpy.mockReset())

describe('community tiles', () => {
  test.each(COMMUNITY_ROUTES)('%s resolves to a stored photograph with no network call', async (slug) => {
    const src = await community.getCommunityHeroPhoto(slug)
    expect(src).toBeTruthy()
    expect(src).not.toMatch(/pexels|\.svg$/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('the doorway (african) and the three named by the project manager are Lawal\'s own photographs', async () => {
    expect(await community.getCommunityHeroPhoto('african')).toMatch(/\/event-images\/stock\/scenes\/afrobeats-amapiano\/crowd-hands-up-night-/)
    expect(await community.getCommunityHeroPhoto('caribbean')).toMatch(/\/scenes\/caribbean-dancehall\/carnival-colour-day-/)
    expect(await community.getCommunityHeroPhoto('latin-american')).toMatch(/\/scenes\/latin\/beachfront-social-dusk-/)
  })
})

describe('category tiles', () => {
  test.each(REAL_CATEGORIES)('%s resolves to a stored photograph with no network call', async (slug) => {
    const photo = await category.getCategoryPhoto(slug)
    expect(category.isBrandedFallbackPhoto(photo)).toBe(false)
    expect(photo.src).not.toMatch(/pexels/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('comedy is the bundled original', async () => {
    expect((await category.getCategoryPhoto('comedy')).src).toBe('/images/hero/comedy.jpg')
  })
})

describe('sub-community tiles', () => {
  test('a kept one resolves to its stored file with no network call; one never kept answers null as before', async () => {
    const sub = await import('@/lib/images/sub-community-photo')
    expect(await sub.getSubCommunityPhoto('african', 'owambe')).toBe('/images/library/sub-african-owambe.jpg')
    expect(await sub.getSubCommunityPhoto('Caribbean', 'Reggae')).toBe('/images/library/sub-caribbean-reggae.jpg')
    expect(await sub.getSubCommunityPhoto('greek', 'glendi')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('a refused city lookup', () => {
  test('a spine city asks nothing; a refused answer for another city is not kept', async () => {
    const city = await import('@/lib/images/city-photo')
    expect(await city.getCityPhoto('melbourne')).toMatch(/\/event-images\/stock\/cities\/melbourne\//)
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
    expect(await city.getCityPhoto('ballarat')).toBeNull()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ photos: [{ src: { large: 'https://images.pexels.com/b.jpg', medium: 'm', portrait: 'https://images.pexels.com/b-p.jpg' }, width: 900, height: 1300, alt: 'b', photographer: 'p' }] }), { status: 200 }),
    )
    expect(await city.getCityPhoto('ballarat')).toBe('https://images.pexels.com/b-p.jpg')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('a refused Pexels answer', () => {
  test('is never kept: the next call asks again, and is served once it answers', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
    const first = await category.getCategoryPhoto('a-slug-no-table-names')
    expect(category.isBrandedFallbackPhoto(first)).toBe(true)

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ photos: [{ src: { large: 'https://images.pexels.com/x.jpg', medium: 'https://images.pexels.com/x-m.jpg' }, width: 2000, height: 1300, alt: 'x', photographer: 'p' }] }), { status: 200 }),
    )
    const second = await category.getCategoryPhoto('a-slug-no-table-names')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(category.isBrandedFallbackPhoto(second)).toBe(false)
  })
})
