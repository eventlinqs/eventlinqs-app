import { getCategoryPhoto } from './category-photo'

// M6+: add in-app curated image library for organisers. Until then, branded
// placeholder is the only fallback in tile contexts — no Pexels stock.

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
 * Hero-only resolver that NEVER uses organiser cover_image_url as the background.
 *
 * Rationale: the full-bleed hero background should always be a cinematic
 * Pexels clip or curated crowd still — not a static organiser upload that was
 * designed for card contexts.
 *
 * Priority:
 *   1. organiser-uploaded video_url (self-hosted — no 3rd-party cookies)
 *   2. Pexels category photo (Ken Burns) — routed via next/image proxy
 *   3. Self-hosted curated crowd still
 *
 * NOTE: we deliberately skip Pexels videos. Their Cloudflare-fronted CDN sets
 * the `_cfuvid` cookie on <video src=...> requests, which Lighthouse flags as
 * third-party tracking and drops Best Practices to 77. Pexels stills go
 * through /_next/image so they look same-origin and carry no cookies.
 */
const HERO_CROWD_VIDEO = '/hero/hero-crowd.mp4'

export async function getFeaturedHeroBackground(event: EventMediaInput): Promise<EventMedia> {
  if (event.video_url) {
    return {
      kind: 'video',
      src: event.video_url,
      poster: FALLBACK_POSTER,
      duration: 0,
    }
  }

  const photo = await getCategoryPhoto(event.category?.slug)
  if (photo && photo.src !== '/images/event-fallback-hero.svg') {
    return {
      kind: 'still-kenburns',
      src: photo.src,
      alt: event.title ?? photo.alt,
    }
  }

  return {
    kind: 'video',
    src: HERO_CROWD_VIDEO,
    poster: FALLBACK_POSTER,
    duration: 0,
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
