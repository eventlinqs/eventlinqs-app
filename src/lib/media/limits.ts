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
 * a tiny image reads as broken at full bleed. 1000px is the hard floor that
 * rejects genuinely under-size covers, matched to the category-leader bar
 * (1000px wide minimum, 2160px recommended source width) so we are never
 * stricter than the market. Gallery images have no minimum (they render small,
 * below the fold).
 */
export const MIN_COVER_WIDTH = 1000
export const RECOMMENDED_COVER_WIDTH = 2160

/**
 * ORGANISER LOGO. A different object from a photograph and it needs different
 * rules, so it gets its own constants rather than borrowing the cover ones.
 *
 * The market, read from the platforms' own published help pages on 8 August
 * 2026:
 *
 * - Eventbrite, "How to set up your organizer profile page" (help article
 *   161196): "Organizer profile image: This will appear on your event listing
 *   and organizer profile. Eventbrite recommends a 1:1 ratio for square images,
 *   like 400x400."
 * - Humanitix, "How to style your event page" (help article 8951375): the
 *   organiser logo REPLACES the Humanitix logo in the top left of the event
 *   page. "The logo image on the event page is dynamic and will accommodate
 *   logos of all sizes. However we recommend a 'landscape' image. Max size
 *   10MB." And, on legibility: "We recommend checking if your logo matches
 *   both light and dark modes. Your logo's colours will not automatically
 *   change based on the page settings."
 *
 * So: accept both shapes, because organisers really do have both a square mark
 * and a landscape wordmark, and never squash one into the other. 400 pixels on
 * the long edge is the floor, matching the square figure Eventbrite publishes,
 * because a logo that is fine on a profile page at 64 pixels is a smear on a
 * 1080 pixel story card.
 *
 * The legibility problem Humanitix hands back to the organiser is handled for
 * them instead: see resolveLogoPlacement in the image pipeline.
 */
export const MIN_LOGO_LONG_EDGE = 400
export const RECOMMENDED_LOGO_LONG_EDGE = 1000
/** Widest and tallest a logo may be, as width over height. */
export const MAX_LOGO_ASPECT = 4
export const MIN_LOGO_ASPECT = 0.25

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
