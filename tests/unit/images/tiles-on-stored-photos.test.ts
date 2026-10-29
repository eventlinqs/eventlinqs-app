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

describe('city tiles and heroes', () => {
  test('every city resolves to a stored photograph with no network call: the spine first, else the one kept', async () => {
    const city = await import('@/lib/images/city-photo')
    expect(await city.getCityPhoto('melbourne')).toMatch(/\/event-images\/stock\/cities\/melbourne\//)
    expect(await city.getCityPhoto('ballarat')).toBe('/images/library/city-ballarat.jpg')
    expect(await city.getCityHeroPhoto('Sunshine-Coast')).toBe('/images/library/city-hero-sunshine-coast.jpg')
    expect(await city.getCityPhoto('lagos')).toBe('/images/library/city-lagos.jpg')
    expect(await city.getCityPhoto('nowhere-at-all')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('every slug a page hands getCategoryPhoto', () => {
  test.each([
    ['concert', /\/event-images\/stock\/categories\/music\//],
    ['dj-set', /\/event-images\/stock\/scenes\/electronic-dance\//],
    ['theatre', /\/event-images\/stock\/categories\/arts-community\//],
    ['workshop', /^\/images\/library\/education\.jpg$/],
    ['sport', /\/event-images\/stock\/categories\/sports\//],
    ['country', /\/event-images\/stock\/scenes\/country\//],
    ['electronic', /\/event-images\/stock\/scenes\/electronic-dance\//],
    ['indie-rock', /\/event-images\/stock\/scenes\/indie-rock\//],
    ['gospel', /^\/images\/hero\/gospel\.jpg$/],
  ])('%s, from a city page or the organisers strip, is a stored photograph with no network call', async (slug, src) => {
    expect((await category.getCategoryPhoto(slug)).src).toMatch(src)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('a slug no table names gets the stored other photograph, never the placeholder and never Pexels', async () => {
    const photo = await category.getCategoryPhoto('a-slug-no-table-names')
    expect(category.isBrandedFallbackPhoto(photo)).toBe(false)
    expect(photo.src).toBe((await category.getCategoryPhoto('other')).src)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('suburb tiles and heroes', () => {
  test('every suburb is its kept photograph with no network call; one never kept answers null', async () => {
    const suburb = await import('@/lib/images/suburb-photo')
    expect(await suburb.getSuburbHeroPhoto('sydney-inner-west')).toBe('/images/library/suburb-sydney-inner-west.jpg')
    expect(await suburb.getSuburbHeroPhoto('hobart-inner-city')).toBe('/images/library/suburb-hobart-inner-city.jpg')
    expect(await suburb.getSuburbHeroPhoto('nowhere-at-all')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
