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
 * The long edge every uploaded image is DOWNSCALED to. Not a reject.
 *
 * This used to be MAX_IMAGE_DIMENSION = 4000 and a hard server-side reject, and
 * it refused a 3625 x 4961 photo, which is ordinary camera output. The defect
 * was the VERB, not the number: the market resizes where we refused. Neither
 * Eventbrite nor Humanitix publishes a maximum pixel dimension at all. Both
 * publish a 10MB byte cap (kept, as MAX_IMAGE_BYTES) and a recommended MINIMUM
 * resolution, and Humanitix's answer to an image that does not fit its ratio is
 * "Images outside of this ratio will be cropped", not a refusal.
 *   - Eventbrite, help article 682424, fetched 9 August 2026: recommended
 *     2160 x 1080, max 10MB, JPEG or PNG.
 *   - Humanitix, help article 8892493, fetched 9 August 2026: "Images must be
 *     less than 10mb", "minimum of 3200px by 1600px" recommended.
 *
 * WHY 3000 (founder ruling, 9 August 2026). The binding case is print: the A4
 * poster is the only artefact anywhere near this size. Every other artefact is
 * far below it and does not drive the number (tall card 1440 x 1800, story card
 * 1080 x 1920, square 1080 x 1080).
 *
 * The arithmetic, stated because a wrong comment beside a right constant is how
 * somebody later changes it in the wrong direction: A4 is 210 x 297mm, so its
 * long edge is 11.69in and 3000px across it is about 257dpi. That is NOT true
 * 300dpi, which would need 3508px. 3000 is deliberate anyway: these posters go
 * in venue windows and on pub noticeboards, read from a metre away, where the
 * difference is invisible, and 3508 costs roughly 35% more storage on every
 * image forever for quality this market will never see. Reversible upward if a
 * promoter ever reports a print shop refusing their file; storage already paid
 * for is not reclaimable.
 */
export const IMAGE_DOWNSCALE_LONG_EDGE = 3000

/**
 * A real safety guard, which the 4000px reject never was: it was protecting
 * against nothing and refusing real photos. This refuses a decompression bomb,
 * an image whose declared dimensions are small on disk but enormous in memory.
 * 100 megapixels is far above any camera an organiser owns and far below what
 * would exhaust the function.
 */
export const MAX_IMAGE_PIXELS = 100_000_000

/*
 * MERGE NOTE, fix/production-sweep meeting this line. Both branches fixed the
 * SAME defect independently: the 4000px hard reject that turned away an
 * ordinary 3625 x 4961 camera photo. Both replaced the reject with a downscale,
 * so neither fix is lost. Only the NUMBERS differed. production-sweep chose a
 * 4000px stored edge with an 80 megapixel bomb guard; this line chose 3000 and
 * 100 megapixels under the founder ruling of 9 August 2026 recorded above,
 * which carries the A4 print arithmetic. The ruling stands, so the two
 * constants above are the ones kept, and production-sweep's two constants are
 * dropped because nothing outside this file imported them.
 *
 * Its EVIDENCE is not lost, because it is the same evidence reached twice:
 * neither Eventbrite nor Humanitix publishes a pixel ceiling, both cap by file
 * size and process server-side, and Eventbrite crops rather than refusing.
 *
 * Its two BEHAVIOURS are kept in image-pipeline.ts, because they are additive
 * rather than alternative: limitInputPixels bounds the decode inside sharp
 * itself, and the refusal names the megapixels and the dimensions instead of
 * the generic not-an-image line.
 */

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
 * - Eventbrite, "How to set up your organizer profile page" (help article 161196,
 *   https://www.eventbrite.com/help/en-us/articles/161196/, re-fetched and the
 *   quote confirmed 12 August 2026): "Organizer profile image: This will appear
 *   on your event listing and organizer profile. Eventbrite recommends a 1:1
 *   ratio for square images, like 400x400."
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
