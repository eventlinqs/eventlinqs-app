import { unstable_cache } from 'next/cache'

/**
 * Category-aware photo pipeline backed by Pexels.
 *
 * If PEXELS_API_KEY is missing or the request fails, every caller
 * receives the EventLinqs-branded fallback SVG. No throws, no broken images.
 *
 * Query strategy (rebuilt batch 3 - cultural relevance):
 *   - Each culture maps to a multi-word DESCRIPTIVE query that biases
 *     Pexels toward concrete cultural visual cues (instruments, dress,
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

// 18 hero cultures + Tier-2 categories. Queries are descriptive not generic.
// Order roughly mirrors the canonical cultures list in CLAUDE.md.
const CATEGORY_QUERIES: Record<string, string> = {
  // ---- 18 hero cultures ----------------------------------------------
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
  'heritage-and-independence': 'cultural festival flags parade traditional dress',
  'networking':                'business networking conference handshake professionals',
  'business-networking':       'business networking conference handshake professionals',

  // ---- general categories (when no culture is set) ------------------
  'music':                     'live band concert colorful stage lights vibrant crowd',
  'sports':                    'stadium crowd daytime match fans colorful bright',
  'arts-culture':              'art gallery bright modern exhibition people daytime',
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
}

export interface PexelsPhoto {
  src: string
  thumb: string
  alt: string
  photographer: string
}

const FALLBACK: PexelsPhoto = {
  src: '/images/event-fallback-hero.svg',
  thumb: '/images/event-fallback-thumb.svg',
  alt: 'EventLinqs',
  photographer: 'EventLinqs',
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
  } catch {
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
