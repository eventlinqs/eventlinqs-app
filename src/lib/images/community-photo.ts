import { unstable_cache } from 'next/cache'
import { getSpineSceneForCommunity } from './spine'

/**
 * Community-aware photo pipeline backed by Pexels.
 *
 * Mirrors city-photo.ts but for the /community/[slug] hero band.
 * Returns a landscape-oriented URL string (wide cinematic band).
 *
 * Falls back to null when PEXELS_API_KEY is missing or the request fails.
 * Callers substitute a brand fallback (BrandedPlaceholder or
 * --color-navy-950 surface) when null.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

// Community queries are descriptive and community-relevant. Pexels returns
// stock photography; the queries trade abstract genre tags for visual
// recognisability (carnival floats over "caribbean music", parol
// lanterns over "filipino night").
const COMMUNITY_QUERIES: Record<string, string> = {
  // Tier 1
  'african':         'african celebration dance music vibrant crowd colorful',
  'south-asian':     'indian wedding sangeet bollywood dance celebration',
  'caribbean':       'caribbean carnival soca steel drum tropical parade',
  'latin':           'latin dance salsa club music vibrant lights',
  'east-asian':      'lunar new year red lanterns dragon celebration',
  'filipino':        'filipino fiesta celebration parol traditional',
  'mediterranean':   'italian festival pasta wine celebration warm',
  'middle-eastern':  'middle eastern dabke dance celebration colorful lights',
  'european':        'european festival folk dance celebration outdoor',
  'pacific':         'pacific islander polynesian dance celebration outdoor',
  // Tier 2
  'gospel':          'gospel choir worship raised hands joy lights',
  'comedy':          'comedy club stage microphone audience laughing',
  'wellness':        'yoga wellness meditation outdoor calm sunrise',
  'pride':           'pride parade rainbow celebration joy crowd',
  // Heritage route slugs (the canonical /community/[slug] + community rail slugs)
  // that previously had no query and fell to the branded placeholder. The
  // spine-wired heritages (indian, chinese, italian, pacific-pasifika,
  // aboriginal-torres-strait-islander) render their licensed photo first; these
  // are the Pexels fallback for the heritages without a spine slot.
  'latin-american':     'latin american festival celebration colourful dance crowd',
  'greek':              'greek festival traditional dance celebration food',
  'japanese':           'japanese matsuri festival lanterns traditional celebration',
  'korean':             'korean festival hanbok traditional celebration community',
  'lebanese-levantine': 'lebanese dabke dance celebration feast colourful',
  'vietnamese':         'vietnamese lunar festival lanterns traditional celebration',
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface PexelsApiPhoto {
  src: { large: string; medium: string; landscape?: string }
  width?: number
  height?: number
  alt: string | null
  photographer: string
}

const TOP_N = 5

async function fetchCommunityHeroPhotoRaw(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return null

    const usable = data.photos.filter(p => (p.width ?? 0) >= 1600 && (p.height ?? 0) >= 900)
    const pool = (usable.length > 0 ? usable : data.photos).slice(0, TOP_N)
    const photo = pool[simpleHash(query + ':community-hero') % pool.length]

    return photo.src.landscape ?? photo.src.large
  } catch {
    return null
  }
}

const fetchCommunityHeroPhoto = unstable_cache(
  fetchCommunityHeroPhotoRaw,
  ['pexels-community-hero-v1'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels', 'pexels-community'] }
)

// Bundled per-community hero raster shipped in public/images/hero/. Used as
// a deterministic fallback when the Pexels lookup returns null (missing
// PEXELS_API_KEY, network failure, rate limit, zero search results). The
// Pexels path stays the primary source so production keeps its varied
// stock photography; this is purely the safety net.
//
// Why this exists: PhotographicCommunityHero only renders a CSS gradient
// when imageSrc is null, which means Lighthouse cannot observe any
// LCP-eligible element and the audit returns NO_LCP for the page. That
// degraded the perf score to null in CI (no PEXELS_API_KEY available)
// and would also degrade real-user LCP on any Pexels outage. A bundled
// raster gives HeroMedia a real <img> with priority + fetchPriority, so
// LCP is always measurable, regardless of upstream Pexels availability.
//
// Only the community slugs with an obvious-match bundled file are mapped.
// Communities without a match keep the prior null behaviour (CSS gradient
// fallback); the lighthouse gate currently only audits /community/african
// so this is enough to close the CI gap without inventing new imagery.
const COMMUNITY_BUNDLED_FALLBACK: Record<string, string> = {
  'african':     '/images/hero/afrobeats.jpg',
  'south-asian': '/images/hero/bollywood.jpg',
  'caribbean':   '/images/hero/caribbean-carnival.jpg',
  'latin':       '/images/hero/latin.jpg',
  'east-asian':  '/images/hero/lunar.jpg',
  'filipino':    '/images/hero/filipino.jpg',
  'gospel':      '/images/hero/gospel.jpg',
  'comedy':      '/images/hero/comedy.jpg',
}

export interface GetCommunityHeroPhotoOptions {
  /**
   * When true, returns a bundled local raster from
   * COMMUNITY_BUNDLED_FALLBACK if the Pexels lookup yields null. Use for
   * surfaces that REQUIRE a measurable LCP element (the /community/[slug]
   * page hero, which renders a CSS-gradient-only fallback otherwise and
   * fails Lighthouse with NO_LCP).
   *
   * DO NOT set true for HeroCarousel-style slots where a null result is
   * intentionally falling back to a gradient + headline text and the
   * text itself is the LCP candidate: forcing a priority image there
   * regresses LCP measurement under Lighthouse's cold-start image
   * optimiser (the image becomes the LCP candidate but completes paint
   * after the gather window closes, producing NO_LCP). Verified on
   * PR #40: opt-in fallback restored /community/african to a valid score
   * while leaving the homepage HeroCarousel text-LCP untouched.
   */
  allowBundledFallback?: boolean
}

export async function getCommunityHeroPhoto(
  slug: string,
  opts: GetCommunityHeroPhotoOptions = {},
): Promise<string | null> {
  // Spine-first for the WIRED community scenes (held scenes await Phase 2).
  const spine = getSpineSceneForCommunity(slug)
  if (spine) return spine.src
  const key = slug.toLowerCase()
  const query = COMMUNITY_QUERIES[key]
  if (!query) return null
  const pexels = await fetchCommunityHeroPhoto(query)
  if (pexels) return pexels
  if (opts.allowBundledFallback) return COMMUNITY_BUNDLED_FALLBACK[key] ?? null
  return null
}

export function isKnownCommunityQuerySlug(slug: string): boolean {
  return slug.toLowerCase() in COMMUNITY_QUERIES
}
