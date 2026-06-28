// Event Media Standard - the single source for the COUNTS, LIMITS, and accepted
// formats that govern organiser-uploaded event media. Pinned by
// docs/EventLinqs-Event-Media-Standard-SPEC.md. Both the client uploader and the
// server pipeline import these constants so the UI and the server can never
// disagree on what is allowed (the same defect class the fee-math single source
// removed for pricing).

/** 1 cover + up to 9 gallery = 10 images maximum per event (Eventbrite ceiling). */
export const MAX_GALLERY_IMAGES = 9
export const MAX_TOTAL_IMAGES = 10

/** Maximum upload size per image. Matches the long-standing client cap. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB

/** Maximum pixel dimension on either edge. Server-side hard reject. */
export const MAX_IMAGE_DIMENSION = 4000

/**
 * Minimum width for a COVER image. The cover is the hero + card + LCP raster, so
 * a tiny image reads as broken at full bleed. 1200px is the hard floor that
 * rejects genuinely under-size covers; 1920px is the recommended source width
 * (SPEC 1.1). Gallery images have no minimum (they render small, below the fold).
 */
export const MIN_COVER_WIDTH = 1200
export const RECOMMENDED_COVER_WIDTH = 1920

/**
 * Accepted upload formats by their real (magic-byte) sharp format id. SVG and any
 * non-raster / active content is rejected (XSS). HEIC/HEIF (iPhone) is accepted
 * then converted to JPEG on ingest. GIF/TIFF/etc are not photographic event media
 * and are rejected.
 */
export const ACCEPTED_IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'heif'] as const
export type AcceptedImageFormat = (typeof ACCEPTED_IMAGE_FORMATS)[number]

/** The browser `accept` attribute mirror of ACCEPTED_IMAGE_FORMATS. */
export const IMAGE_ACCEPT_ATTR =
  'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif'

/** Allowlisted video embed providers. EventLinqs never self-hosts the file. */
export const VIDEO_PROVIDERS = ['youtube', 'vimeo', 'instagram', 'tiktok'] as const
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number]
