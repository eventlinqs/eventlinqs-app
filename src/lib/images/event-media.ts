import { getCategoryPhoto } from './category-photo'

// M6+: add in-app curated image library for organisers. Until then, branded
// placeholder is the only fallback in tile contexts - no Pexels stock.

// picsum.photos is a seed-script placeholder, not real imagery. Treat it as
// "no cover" so the tile falls through to category Pexels / branded SVG.
function isRealCover(url: string | null | undefined): url is string {
  if (!url) return false
  return !/^https:\/\/picsum\.photos\//i.test(url)
}

/**
 * Orchestrator that decides what media to display for any event.
 *
 * Priority (standard tile, getEventMedia):
 *   1. organiser video_url
 *   2. organiser gallery_urls (>= 3 images) → carousel
 *   3. organiser cover_image_url → Ken Burns still
 *   4. branded placeholder (EventLinqs wordmark + category label)
 *
 * Priority (featured bento tile, getFeaturedEventMedia):
 *   1-3 as above
 *   4. branded placeholder
 *
 * Pexels photography is reserved for full-bleed hero backgrounds
 * (getFeaturedHeroBackground) and By City rail tiles only.
 */

export type EventMedia =
  | { kind: 'video'; src: string; poster: string; duration: number }
  | { kind: 'carousel'; images: string[]; alts: string[] }
  | { kind: 'still-kenburns'; src: string; alt: string }
  | { kind: 'branded-placeholder'; category: string | null }

export interface EventMediaInput {
  title?: string | null
  cover_image_url?: string | null
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
  video_url?: string | null
  category?: { slug?: string | null; name?: string | null } | null
}

const FALLBACK_POSTER = '/images/event-fallback-hero.svg'

export async function getEventMedia(event: EventMediaInput): Promise<EventMedia> {
  if (event.video_url) {
    return {
      kind: 'video',
      src: event.video_url,
      poster: isRealCover(event.cover_image_url) ? event.cover_image_url : FALLBACK_POSTER,
      duration: 0,
    }
  }

  if (event.gallery_urls && event.gallery_urls.length >= 3 && event.gallery_urls.every(isRealCover)) {
    return {
      kind: 'carousel',
      images: event.gallery_urls,
      alts: event.gallery_urls.map(() => event.title ?? 'Event imagery'),
    }
  }

  if (isRealCover(event.cover_image_url)) {
    return {
      kind: 'still-kenburns',
      src: event.cover_image_url,
      alt: event.title ?? 'Event cover',
    }
  }

  const photo = await getCategoryPhoto(event.category?.slug)
  if (photo.src !== FALLBACK_POSTER) {
    return {
      kind: 'still-kenburns',
      src: photo.src,
      alt: event.title ?? photo.alt,
    }
  }

  return {
    kind: 'branded-placeholder',
    category: event.category?.name ?? event.category?.slug ?? null,
  }
}

export async function getFeaturedEventMedia(event: EventMediaInput): Promise<EventMedia> {
  if (event.video_url) {
    return {
      kind: 'video',
      src: event.video_url,
      poster: isRealCover(event.cover_image_url) ? event.cover_image_url : FALLBACK_POSTER,
      duration: 0,
    }
  }

  if (event.gallery_urls && event.gallery_urls.length >= 3 && event.gallery_urls.every(isRealCover)) {
    return {
      kind: 'carousel',
      images: event.gallery_urls,
      alts: event.gallery_urls.map(() => event.title ?? 'Event imagery'),
    }
  }

  if (isRealCover(event.cover_image_url)) {
    return {
      kind: 'still-kenburns',
      src: event.cover_image_url,
      alt: event.title ?? 'Event cover',
    }
  }

  const photo = await getCategoryPhoto(event.category?.slug)
  if (photo.src !== FALLBACK_POSTER) {
    return {
      kind: 'still-kenburns',
      src: photo.src,
      alt: event.title ?? photo.alt,
    }
  }

  return {
    kind: 'branded-placeholder',
    category: event.category?.name ?? event.category?.slug ?? null,
  }
}

/**
 * Hero-only resolver. Returns a raster-first shape designed for `<HeroMedia>`.
 *
 * Contract: `image` is ALWAYS a raster URL (AVIF/JPEG/WebP). The W3C
 * LargestContentfulPaint spec excludes SVG, so the hero LCP layer must
 * never receive an SVG - that is what produced the iter-0 NO_LCP error.
 *
 * Priority:
 *   1. organiser-uploaded video_url → ambient overlay; raster poster comes
 *      from organiser cover (if real) or the category hero raster
 *   2. Pexels category photo → ken-burns still
 *   3. Pre-generated category hero raster from /images/hero/{slug}.jpg
 *
 * Pexels stills go through /_next/image so they look same-origin and carry
 * no cookies. Pexels VIDEOS are deliberately skipped - their Cloudflare-
 * fronted CDN sets `_cfuvid` on <video> requests and Lighthouse flags it
 * as third-party tracking, dropping Best Practices to 77.
 */
export interface HeroBackgroundMedia {
  /** Raster URL for the HeroMedia LCP layer (never SVG). */
  image: string
  /** Alt text for the hero image. */
  alt: string
  /** Optional ambient video - overlay only, played after LCP commits. */
  videoSrc?: string
  /** When true, ken-burns scale runs on the post-LCP ambient layer. */
  kenBurns?: boolean
}

const HERO_RASTER_DIR = '/images/hero'

// Slugs we have on disk (see scripts/fetch-hero-rasters.mjs). Anything not in
// this set falls back to the canonical "afrobeats" raster - chosen because
// the multicultural-festival shot reads as "the platform" rather than as any
// one category.
const HERO_RASTER_SLUGS = new Set([
  'afrobeats',
  'gospel',
  'amapiano',
  'owambe',
  'comedy',
  'caribbean-carnival',
  'bollywood',
  'latin',
  'filipino',
  'lunar',
])
const HERO_RASTER_DEFAULT = `${HERO_RASTER_DIR}/afrobeats.jpg`

function heroRasterFor(slug: string | null | undefined): string {
  if (slug && HERO_RASTER_SLUGS.has(slug)) return `${HERO_RASTER_DIR}/${slug}.jpg`
  return HERO_RASTER_DEFAULT
}

export async function getFeaturedHeroBackground(
  event: EventMediaInput,
): Promise<HeroBackgroundMedia> {
  const fallbackImage = heroRasterFor(event.category?.slug)
  const fallbackAlt = event.title ?? event.category?.name ?? 'Cultural event'

  if (event.video_url) {
    return {
      image: fallbackImage,
      alt: fallbackAlt,
      videoSrc: event.video_url,
    }
  }

  const photo = await getCategoryPhoto(event.category?.slug)
  if (photo && photo.src !== FALLBACK_POSTER) {
    return {
      image: photo.src,
      alt: event.title ?? photo.alt,
      kenBurns: true,
    }
  }

  return {
    image: fallbackImage,
    alt: fallbackAlt,
    kenBurns: true,
  }
}

/**
 * Lightweight single-image helper for card contexts that don't need the full
 * EventMedia union. Used for This Week strip + compact tiles where carousel
 * or video would be overkill.
 */
export async function getEventStillImage(event: EventMediaInput): Promise<string> {
  if (isRealCover(event.cover_image_url)) return event.cover_image_url
  if (isRealCover(event.thumbnail_url)) return event.thumbnail_url
  if (event.gallery_urls && event.gallery_urls.length > 0) {
    const first = event.gallery_urls.find(isRealCover)
    if (first) return first
  }
  const photo = await getCategoryPhoto(event.category?.slug)
  return photo.thumb
}
