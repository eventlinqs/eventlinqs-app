import { getSpineCategoryTile, getSpineSceneForSound } from './spine'
import { storedCategoryPhoto } from './stored-photos'

/**
 * A category's tile photograph, from stored photographs only (getCategoryPhoto below). The type keeps its old name,
 * PexelsPhoto, because every caller and test names it; no photograph here comes from a request to Pexels any more.
 */

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

/**
 * Resolve a category's tile photograph.
 *
 * STORED PHOTOGRAPHS ONLY, NEVER A REQUEST-TIME CALL (Lawal, 22:23 on 29 October 2026; the project manager's 03:09 on
 * 30 October). In order: Lawal's licensed category tile through the spine; the category's stored photograph
 * (src/lib/images/stored-photos.ts, which also holds the city pages' event types); Lawal's scene for a sound slug
 * (the organisers page strip passes country, electronic and indie-rock); and for a slug no table names, the stored
 * 'other' photograph, never the placeholder.
 *
 * This used to ask Pexels for any slug no table named and cache the answer for a week, which is how production's
 * Concerts, DJ Sets, Theatre, Workshops and Sports tiles on every city page, and four tiles on /organisers, were
 * still a live Pexels call on 30 October. A stored photograph is one per slug, as a tile should be.
 */
export async function getCategoryPhoto(categorySlug: string | null | undefined): Promise<PexelsPhoto> {
  const slug = (categorySlug || 'other').toLowerCase()
  const stored = getSpineCategoryTile(slug) ?? storedCategoryPhoto(slug) ?? getSpineSceneForSound(slug) ?? storedCategoryPhoto('other')
  if (!stored) return FALLBACK
  return { src: stored.src, thumb: stored.src, alt: `${slug.replace(/-/g, ' ')} events`, photographer: 'EventLinqs library' }
}
