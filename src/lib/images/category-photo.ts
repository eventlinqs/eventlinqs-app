import { unstable_cache } from 'next/cache'
import { captureException } from '@/lib/observability/sentry'

/**
 * Category-aware photo pipeline backed by Pexels.
 *
 * If PEXELS_API_KEY is missing or the request fails, every caller
 * receives the EventLinqs-branded fallback SVG. No throws, no broken images.
 *
 * Query strategy (rebuilt batch 3 - community relevance):
 *   - Each community maps to a multi-word DESCRIPTIVE query that biases
 *     Pexels toward concrete community visual cues (instruments, dress,
 *     ritual objects, settings) rather than abstract genre names. The
 *     bare slug "owambe" returns generic urban Africa shots; the phrase
 *     "nigerian wedding party celebration colorful attire" returns
 *     gele headwraps, aso-oke fabric, and dancing crowds.
 *   - Pexels returns roughly relevance-sorted results, so we sample
 *     from the TOP 5 (not first, not full window) to avoid stale repeats.
 *   - orientation=landscape with size=large for min 24MP results.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

// 18 hero communities + Tier-2 categories. Queries are descriptive not generic.
// Order roughly mirrors the canonical communities list in CLAUDE.md.
const CATEGORY_QUERIES: Record<string, string> = {
  // ---- 18 hero communities ----------------------------------------------
  'afrobeats':                 'african music concert dancing crowd vibrant',
  'caribbean':                 'caribbean carnival dance steel drum tropical',
  'bollywood':                 'indian wedding dance saree colorful celebration',
  'latin':                     'latin dance salsa club music vibrant',
  'italian':                   'italian festival pasta wine celebration warm',
  'filipino':                  'filipino fiesta celebration parol traditional',
  'lunar':                     'lunar new year red lanterns dragon celebration',
  'gospel':                    'gospel choir worship raised hands joy',
  'amapiano':                  'south african dance music party youth',
  'comedy':                    'comedy club stage microphone audience laughing',
  'spanish':                   'spanish flamenco dance guitar passion',
  'k-pop':                     'korean concert lights crowd young energetic',
  'kpop':                      'korean concert lights crowd young energetic',
  'reggae':                    'jamaica music dreadlocks beach sunset',
  'west-african':              'west african drum dance traditional dress',
  'european':                  'european music festival outdoor crowd summer',
  'asian':                     'asian lantern festival night colorful celebration',
  'south-asian':               'indian classical dance traditional dress temple',
  'african':                   'african drumming dance traditional celebration',

  // ---- additional hero / Tier-2 slugs already in routes ------------
  'owambe':                    'nigerian wedding party celebration colorful attire',
  'heritage-and-independence': 'community festival flags parade traditional dress',
  'networking':                'business networking conference handshake professionals',
  'business-networking':       'business networking conference handshake professionals',

  // ---- general categories (when no community is set) ------------------
  'music':                     'live band concert colorful stage lights vibrant crowd',
  'sports':                    'stadium crowd daytime match fans colorful bright',
  'arts-community':              'art gallery bright modern exhibition people daytime',
  'food-drink':                'food market colorful fresh outdoor daytime tasting',
  'family':                    'family fun outdoor sunny park children daytime bright',
  'fashion':                   'fashion runway show models lights',
  'film':                      'cinema premiere red carpet audience',
  'health-wellness':           'yoga wellness meditation outdoor sunrise',
  'religion':                  'congregation worship community ceremony',
  'community':                 'community gathering friends families outdoor',
  'charity':                   'charity volunteers fundraiser smiling helping',
  'education':                 'lecture seminar audience speaker classroom',
  'festival':                  'outdoor festival summer daytime crowd colorful sunny',
  'nightlife':                 'rooftop bar friends sunset drinks vibrant colorful',
  'technology':                'tech conference startup speakers stage',
  'other':                     'community celebration friends together event',

  // ---- the three real categories no query covered (close-out SEO3 step 4) --
  // Every slug in `event_categories` now has a real /categories/<slug> landing,
  // and a landing with no query fell through to the branded SVG while its
  // twenty-one siblings carried a photograph. Descriptive, never generic.
  'pride':                     'pride parade rainbow flags crowd celebration day',
  'middle-eastern':            'middle eastern feast long table lanterns celebration',
  'pacific':                   'pacific island dance performance flowers celebration',
}

export interface PexelsPhoto {
  src: string
  thumb: string
  alt: string
  photographer: string
}

/**
 * THE BRANDED FALLBACK IS A SENTINEL, NOT A PHOTOGRAPH, AND SAYING SO IS THE
 * WHOLE POINT OF `isBrandedFallbackPhoto` BELOW.
 *
 * It is an SVG. `HeroMedia` REFUSES an SVG, because an SVG is not LCP-eligible
 * (docs/MEDIA-ARCHITECTURE.md 5.1), so handing this object's `src` to a hero is
 * a 500 in development and a hero that cannot be the LCP in production.
 *
 * That is not hypothetical. On 19 September 2026 the link-integrity crawler
 * found `/categories/technology` answering 500, linked from `/categories/music`:
 *
 *     [HeroMedia] image must be a raster URL (got SVG):
 *     /images/event-fallback-hero.svg
 *
 * `/categories/[slug]/page.tsx` passed `photo.src` straight into the hero, and
 * because the sentinel is a non-empty string the hero's own last resort
 * (`?? HERO_RASTER_DEFAULT`) was never reached. `??` cannot tell a photograph
 * from a placeholder; only a named test can.
 *
 * src/lib/images/event-media.ts already knew this and compared against a PRIVATE
 * copy of the literal. One decision spelled twice is how the next caller gets it
 * wrong, so the test lives here, beside the declaration, and that copy is gone.
 */
const FALLBACK: PexelsPhoto = {
  src: '/images/event-fallback-hero.svg',
  thumb: '/images/event-fallback-thumb.svg',
  alt: 'EventLinqs',
  photographer: 'EventLinqs',
}

/** The branded placeholder itself, for callers that want to show it deliberately. */
export const BRANDED_FALLBACK_PHOTO: PexelsPhoto = FALLBACK

/**
 * True when the resolver had NO photograph and handed back the branded
 * placeholder. A HERO caller must pass `null` in that case and let its own
 * bundled raster win; a tile or card caller may render the placeholder.
 */
export function isBrandedFallbackPhoto(photo: Pick<PexelsPhoto, 'src'>): boolean {
  return photo.src === FALLBACK.src
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

// Sample from a wider pool so a category rail is NOT a wall of one repeated
// photo. The per-query POOL is fetched + cached once; getCategoryPhoto then
// picks PER EVENT from it (via the optional seed), so cards in the same
// category show different, varied imagery instead of an identical dark tile.
const TOP_N = 10

async function fetchPexelsPoolRaw(query: string): Promise<PexelsPhoto[]> {
  if (!PEXELS_API_KEY) return [FALLBACK]

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=24&orientation=landscape&size=large`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return [FALLBACK]

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return [FALLBACK]

    // Filter to min 1200x800 + keep the top results as a sampling pool.
    const usable = data.photos.filter(p => (p.width ?? 0) >= 1200 && (p.height ?? 0) >= 800)
    const pool = (usable.length > 0 ? usable : data.photos).slice(0, TOP_N)
    return pool.map(photo => ({
      src: photo.src.landscape ?? photo.src.large,
      thumb: photo.src.medium,
      alt: photo.alt ?? query,
      photographer: photo.photographer,
    }))
  } catch (error) {
    captureException(error, { where: 'lib/images/category-photo:134' })
    return [FALLBACK]
  }
}

const fetchPexelsPool = unstable_cache(
  fetchPexelsPoolRaw,
  ['pexels-category-pool-v1'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels'] }
)

/**
 * Resolve a category photo. Pass a per-event `seed` (e.g. the event title or
 * slug) so two events in the same category get DIFFERENT photos from the
 * pool, breaking the monotonous one-photo-per-rail wall. Omit the seed for
 * category/scene tiles where a single stable image per category is correct.
 */
export async function getCategoryPhoto(
  categorySlug: string | null | undefined,
  seed?: string | null,
): Promise<PexelsPhoto> {
  const slug = (categorySlug || 'other').toLowerCase()
  const query = CATEGORY_QUERIES[slug] ?? CATEGORY_QUERIES.other
  const pool = await fetchPexelsPool(query)
  if (pool.length === 0) return FALLBACK
  return pool[simpleHash(seed || query) % pool.length]
}
