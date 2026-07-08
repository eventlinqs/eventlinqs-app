import { isVideoProvider } from './video-embed'
import { getSupabaseUrl } from '@/lib/supabase/env'

// Pre-publish media safety gate (SPEC 1.5 "moderation hook before publish").
//
// This is a deterministic, enforceable hook that runs on EVERY publish/schedule.
// It guarantees the structural safety properties we can prove without a network
// call: every image is hosted on OUR storage (so it went through the validating
// upload pipeline, with magic-byte/SVG/EXIF/dimension checks, and cannot be a hot
// -linked off-platform or active-content asset), and any video is an allowlisted,
// server-parsed provider embed (never a raw iframe). A bad asset cannot reach a
// public surface.
//
// It is intentionally a single seam: an asynchronous image-classification provider
// (e.g. Rekognition / Hive for nudity/violence) can be added behind this same
// function later without touching any caller. Until that provider exists we do NOT
// claim AI content classification - we enforce exactly what is provable today.

export type MediaModerationResult =
  | { ok: true }
  | { ok: false; reason: 'image_off_platform' | 'video_not_allowlisted'; message: string }

export type EventMediaForModeration = {
  coverImageUrl: string | null | undefined
  galleryUrls: string[]
  videoUrl: string | null | undefined
  videoProvider: string | null | undefined
}

/** True when a URL points at our own Supabase storage public bucket. */
function isOnPlatform(url: string): boolean {
  try {
    const u = new URL(url)
    const base = new URL(getSupabaseUrl())
    return u.hostname === base.hostname && u.pathname.includes('/storage/v1/object/public/')
  } catch {
    return false
  }
}

export function moderateEventMedia(input: EventMediaForModeration): MediaModerationResult {
  const images = [input.coverImageUrl, ...input.galleryUrls].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  )
  for (const url of images) {
    if (!isOnPlatform(url)) {
      return {
        ok: false,
        reason: 'image_off_platform',
        message:
          'Event images must be uploaded to EventLinqs, not linked from another site. Re-upload the image and try again.',
      }
    }
  }

  if (input.videoUrl) {
    if (!input.videoProvider || !isVideoProvider(input.videoProvider)) {
      return {
        ok: false,
        reason: 'video_not_allowlisted',
        message:
          'The event video must be a YouTube, Vimeo, Instagram, or TikTok link. Re-add the video and try again.',
      }
    }
  }

  return { ok: true }
}
