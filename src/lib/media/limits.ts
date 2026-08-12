// Event Media Standard - the single source for the COUNTS, LIMITS, and accepted
// formats that govern organiser-uploaded event media. Pinned by
// docs/EventLinqs-Event-Media-Standard-SPEC.md. Both the client uploader and the
// server pipeline import these constants so the UI and the server can never
// disagree on what is allowed (the same defect class the fee-math single source
// removed for pricing).

/** 1 cover + up to 9 gallery = 10 images maximum per event (Eventbrite ceiling). */
export const MAX_GALLERY_IMAGES = 9
export const MAX_TOTAL_IMAGES = 10

/**
 * Maximum upload size per image. 10MB, which is exactly where both benchmarks
 * sit, so we are neither stricter nor looser than the market:
 *   - Humanitix help, "add or edit an event banner image": "Max size 10MB".
 *   - Eventbrite, own blog, "Easily upload your main event image": "As of July
 *     2015, we've increased the size limit to 10MB, so go ahead and add that
 *     high-resolution photo".
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * The longest edge we STORE. Anything larger is downscaled to fit, never
 * refused.
 *
 * THE DEFECT THIS REPLACES (founder, production, 2026-08-09). This was
 * MAX_IMAGE_DIMENSION and it was a hard reject: a 3625 x 4961 photo, which is
 * ordinary phone and camera output, was turned away with "Image is too large in
 * pixels: 3625 x 4961. The maximum is 4000 x 4000." An organiser whose only
 * artwork is a photo from their phone hit a wall on the step that matters most,
 * and refusing was our convenience, not their limit.
 *
 * Neither benchmark publishes a pixel ceiling at all; both cap by FILE SIZE and
 * process the image server-side:
 *   - Humanitix RECOMMENDS a minimum of 3200 x 1600 and states no maximum in
 *     pixels, which means an organiser following their own advice could be
 *     rejected by the old 4000px rule after a modest crop.
 *   - Eventbrite crops server-side rather than refusing: "If your image is not
 *     2:1 (twice as wide as it is tall), your focus point will be used to crop
 *     your image for your event listing."
 *
 * 4000 is kept as the STORED size because it was already proven sufficient for
 * every delivery surface (the cover is the LCP raster and is re-encoded by
 * /_next/image anyway, and RECOMMENDED_COVER_WIDTH is 2160), so this changes
 * what we do with a big image, not what we serve.
 */
export const MAX_STORED_IMAGE_DIMENSION = 4000

/**
 * Decompression-bomb guard, and the ONLY pixel limit that still refuses.
 *
 * A small file can decode to an enormous bitmap, and sharp allocates roughly
 * 4 bytes per pixel, so an unbounded decode is a memory-exhaustion vector
 * rather than a user problem. 80 megapixels is far above any consumer camera
 * (a 48MP phone is 8000 x 6000 = 48MP; the founder's 3625 x 4961 is 18MP) and
 * bounds a decode at roughly 320MB. sharp's own default is 268 megapixels,
 * which is too generous for a serverless function.
 *
 * This is deliberately NOT the thing an ordinary organiser can trip.
 */
export const MAX_SOURCE_IMAGE_PIXELS = 80_000_000

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
