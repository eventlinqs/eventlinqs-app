import { getCategoryPhoto } from './category-photo'
import { getCategoryVideo } from './category-video'

/**
 * Orchestrator that decides what media to display for any event.
 *
 * Priority (standard tile):
 *   1. organiser video_url
 *   2. organiser gallery_urls (>= 3 images) → carousel
 *   3. organiser cover_image_url → Ken Burns still
 *   4. Pexels category photo → Ken Burns still
 *
 * Priority (featured tile, getFeaturedEventMedia):
 *   1-3 as above
 *   4. Pexels category video (autoplay)
 *   5. Pexels category photo → Ken Burns still
 */

export type EventMedia =
  | { kind: 'video'; src: string; poster: string; duration: number }
  | { kind: 'carousel'; images: string[]; alts: string[] }
  | { kind: 'still-kenburns'; src: string; alt: string }

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
      poster: event.cover_image_url ?? FALLBACK_POSTER,
      duration: 0,
    }
  }

  if (event.gallery_urls && event.gallery_urls.length >= 3) {
    return {
      kind: 'carousel',
      images: event.gallery_urls,
      alts: event.gallery_urls.map(() => event.title ?? 'Event imagery'),
    }
  }

  if (event.cover_image_url) {
    return {
      kind: 'still-kenburns',
      src: event.cover_image_url,
      alt: event.title ?? 'Event cover',
    }
  }

  const photo = await getCategoryPhoto(event.category?.slug)
  return {
    kind: 'still-kenburns',
    src: photo.src,
    alt: event.title ?? photo.alt,
  }
}

export async function getFeaturedEventMedia(event: EventMediaInput): Promise<EventMedia> {
  if (event.video_url) {
    return {
      kind: 'video',
      src: event.video_url,
      poster: event.cover_image_url ?? FALLBACK_POSTER,
      duration: 0,
    }
  }

  if (event.gallery_urls && event.gallery_urls.length >= 3) {
    return {
      kind: 'carousel',
      images: event.gallery_urls,
      alts: event.gallery_urls.map(() => event.title ?? 'Event imagery'),
    }
  }

  if (event.cover_image_url) {
    return {
      kind: 'still-kenburns',
      src: event.cover_image_url,
      alt: event.title ?? 'Event cover',
    }
  }

  const video = await getCategoryVideo(event.category?.slug)
  if (video) {
    return {
      kind: 'video',
      src: video.src,
      poster: video.poster,
      duration: video.duration,
    }
  }

  const photo = await getCategoryPhoto(event.category?.slug)
  return {
    kind: 'still-kenburns',
    src: photo.src,
    alt: event.title ?? photo.alt,
  }
}

/**
 * Lightweight single-image helper for card contexts that don't need the full
 * EventMedia union. Used for This Week strip + compact tiles where carousel
 * or video would be overkill.
 */
export async function getEventStillImage(event: EventMediaInput): Promise<string> {
  if (event.cover_image_url) return event.cover_image_url
  if (event.thumbnail_url) return event.thumbnail_url
  if (event.gallery_urls && event.gallery_urls.length > 0) return event.gallery_urls[0]
  const photo = await getCategoryPhoto(event.category?.slug)
  return photo.thumb
}
