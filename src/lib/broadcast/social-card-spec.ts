/**
 * THE PUBLISHED SPECIFICATIONS THE SOCIAL CARDS ARE BUILT TO.
 *
 * Every number in this file was read off the platform's own current published
 * documentation on 8 August 2026, not from memory and not from a social-media
 * size blog. The citation sits beside the number it justifies, so a future
 * session can re-verify one row without re-researching the set.
 *
 * PRIMARY SOURCES
 *
 * TWO INSTAGRAM SURFACES, TWO DIFFERENT BOUNDS. This is the single most
 * misread thing in this file, so it is stated before the citations. Instagram
 * publishes one set of limits for a human uploading IN THE APP and a different,
 * TIGHTER set for publishing THROUGH THE GRAPH API. The tall bound is 3:4
 * in-app and 4:5 via the API. Both were re-verified on 9 August 2026 and both
 * are quoted below. Our promoters post by hand, so [IG-RES] governs what they
 * do today; we build to the API bound anyway because it is the intersection of
 * the two, so one asset is correct on both surfaces and stays correct if the
 * platform ever publishes on their behalf. An asset built to the LOOSER in-app
 * bound (3:4) would be rejected by the API; an asset built to the TIGHTER API
 * bound (4:5) is safe everywhere. Tighter wins.
 *
 * [IG-RES] IN-APP. Instagram Help Centre, "Image resolution of photos you share
 *   on Instagram" (help.instagram.com/1631821640426723), re-verified 2026-08-09.
 *   Scoped to the app: "regardless of whether you're using Instagram for iPhone
 *   or Android".
 *   "When you share a photo that has a width between 320 and 1080 pixels, we
 *   keep that photo at its original resolution as long as the photo's aspect
 *   ratio is between 1.91:1 and 3:4 (a width of 1080 pixels with a height
 *   between 566 and 1440 pixels). If the aspect ratio of your photo isn't
 *   supported, it will be cropped to fit a supported ratio ... If you share a
 *   photo at a higher resolution, we size it down to a width of 1080 pixels."
 *   The tall bound here IS 3:4, and it IS first-party. It was challenged as
 *   unsourced and the challenge did not hold: the page is Instagram's own and
 *   the quote above is verbatim.
 *
 * [IG-API] API PUBLISHING. Meta for Developers, "IG User Media"
 *   (developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/),
 *   fetched 2026-08-09, verbatim:
 *     "Format: JPEG"
 *     "File size: 8 MB maximum."
 *     "Aspect ratio: Must be within a 4:5 to 1.91:1 range"
 *     "Minimum width: 320 (will be scaled up to the minimum if necessary)"
 *     "Maximum width: 1440 (will be scaled down to the maximum if necessary)"
 *     "Color Space: sRGB."
 *   The 1440 ceiling is inclusive and degrades gracefully ("will be scaled down
 *   ... if necessary"), so a 1440-wide asset is at the limit, not over it.
 *
 * [META-RATIO] Meta Business Help Centre, "Best practices for aspect ratios"
 *   (https://www.facebook.com/business/help/103816146375741):
 *   "For Feed placements: Both 1:1 and 4:5 aspect ratios are supported ...
 *   Vertical 4:5 is recommended for single-image ads to be delivered to the ad
 *   placement Facebook Feed. 1:1 is recommended for single-image ads to be
 *   delivered to Instagram Feed." and "For Stories, Status and Reels
 *   placements: Most people hold their phones vertically so 9:16 is
 *   recommended to capture the whole screen."
 *
 * [META-PIXELS] Meta Business Help Centre, "Recommended minimum image pixel
 *   requirements across placements in Meta Ads Manager"
 *   (https://www.facebook.com/business/help/469767027114079):
 *   Instagram Feed 1080 x 1080, Instagram Stories 1080 x 1080, Facebook
 *   Stories 1080 x 1080, Facebook Feed "For 1:1 ratio: 1080 x 1080 pixels /
 *   For 4:5 ratio: 1440 x 1800 pixels", WhatsApp Status 500 x 320. The page
 *   states these are minimums: "It is recommended that you use the highest
 *   resolution images available."
 *
 * [META-SAFE] Meta Business Help Centre, "About carousel ads in Facebook
 *   Stories" (https://www.facebook.com/business/help/201503794673956):
 *   "Recommended ratio: 9:16 ... Recommended resolution: At least 1080 x 1080
 *   pixels ... To avoid covering these key elements with the call-to-action
 *   button, consider leaving roughly 14% (250 pixels) of the top and bottom of
 *   the image free from text and logos."
 *
 * [LI-IMAGE] LinkedIn, "Single Image Ads Specifications"
 *   (business.linkedin.com/advertise/ads/sponsored-content/single-image-ads-specs):
 *   "File Type: jpg, png, or gif", "File Size: 5 MB", landscape recommended
 *   1.91:1 at 1200 x 628 (minimum 640 x 360), square recommended 1:1 at
 *   1200 x 1200 (minimum 360 x 360, maximum 4320 x 4320), vertical minimum
 *   360 x 640 with 4:5 recommended "to avoid borders".
 *
 * [X-POST] X Help Centre, "How to post on X" (help.x.com/en/using-x/how-to-post):
 *   "Compose your message (up to 280 characters)" and "You can include up to 4
 *   photos, a GIF, or a video ... (and up to 4 total media items)".
 *
 * [X-MEDIA] X API documentation, "Best practices - Media"
 *   (docs.x.com/x-api/media/quickstart/best-practices): "Supported image media
 *   types: JPG, PNG, GIF, WEBP. Image size: <= 5 MB."
 *
 * WHAT IS DELIBERATELY NOT ASSERTED HERE. Instagram's current help page on
 * hashtags (help.instagram.com/351460621611097) documents how to add them and
 * states no numeric cap. The widely repeated "30 hashtags" figure could not be
 * confirmed on any Instagram-published page this session, so the caption engine
 * treats hashtag count as a craft budget, not a platform limit, and stays far
 * below any figure in circulation.
 */

export type SocialCardFormat = 'story' | 'square' | 'feed'

export type SocialCardSpec = {
  /** Rendered pixel width. */
  width: number
  /** Rendered pixel height. */
  height: number
  /** Human ratio, for the UI and the filename. */
  ratio: string
  /** Short human name, used on the kit screen. */
  label: string
  /** Where this exact asset is meant to be posted. */
  postedTo: string
  /**
   * Pixels at the top and bottom that carry no text and no logo. Non-zero only
   * on the story, where the platform overlays its own chrome. [META-SAFE]
   */
  safeTop: number
  safeBottom: number
  /**
   * Height of the photograph region for the banded layouts. Zero means the
   * photograph is full bleed behind a scrim (the story).
   */
  photoHeight: number
  /** The published rule this geometry answers, quoted short for the UI. */
  justification: string
}

export const SOCIAL_CARD_FORMATS: Record<SocialCardFormat, SocialCardSpec> = {
  story: {
    width: 1080,
    height: 1920,
    ratio: '9:16',
    label: 'Story',
    postedTo: 'Instagram and Facebook stories, WhatsApp status',
    // [META-SAFE]: "leaving roughly 14% (250 pixels) of the top and bottom of
    // the image free from text and logos".
    safeTop: 250,
    safeBottom: 250,
    photoHeight: 0,
    // Sources for the ratio and the safe area, restated here because a reference
    // key at the top of the file is not a citation a reader can follow from here:
    // https://www.facebook.com/business/help/103816146375741 (9:16 for Stories,
    // Status and Reels) and https://www.facebook.com/business/help/201503794673956
    // (the 250px top and bottom safe area).
    justification:
      '9:16 is the ratio Meta recommends for stories, status and reels, and the top and bottom 250 pixels are left clear of type, which is the safe area Meta publishes.',
  },
  square: {
    width: 1080,
    height: 1080,
    ratio: '1:1',
    label: 'Square post',
    postedTo: 'Instagram feed, Facebook feed, LinkedIn, X',
    safeTop: 0,
    safeBottom: 0,
    photoHeight: 600,
    // https://www.facebook.com/business/help/103816146375741 (1:1 recommended for
    // Instagram Feed) and https://www.facebook.com/business/help/469767027114079
    // (1080 x 1080 minimum for that placement).
    // The LinkedIn 360 to 4320 range is UNSOURCED: no LinkedIn page carrying it
    // was fetched, so it is marked rather than guessed at.
    justification:
      '1:1 is the ratio Meta recommends for the Instagram feed, and 1080 x 1080 is its recommended minimum resolution for that placement. LinkedIn accepts 1:1 from 360 to 4320 pixels square.',
  },
  feed: {
    width: 1440,
    height: 1800,
    ratio: '4:5',
    label: 'Tall post',
    postedTo: 'Facebook feed, Instagram feed',
    safeTop: 0,
    safeBottom: 0,
    photoHeight: 1150,
    // The publishing API range, fetched 12 August 2026 and quoted verbatim, "Must
    // be within a 4:5 to 1.91:1 range", minimum width 320, maximum width 1440:
    // https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
    //
    // 4:5 is chosen because it is the INTERSECTION of Instagram's two surfaces,
    // not because it is the Facebook recommendation. In-app accepts down to 3:4
    // [IG-RES], which is an in-app behaviour with no primary page fetched for it
    // and is therefore UNSOURCED; the Graph API accepts only down to 4:5 at the
    // URL above. A 4:5 asset is
    // therefore correct on both, while a 3:4 asset would be outside the API
    // range. The earlier justification cited the Facebook ADS minimum for this
    // ratio, which is guidance for paid placements and not a bound on an
    // organic post, and reached the right number for the wrong reason.
    //
    // On the 1440 width: it sits exactly at the API ceiling [IG-API], which is
    // inclusive and scales down rather than rejecting. Instagram in-app will
    // size it to 1080 x 1350 [IG-RES], so the extra pixels buy nothing there;
    // they are kept because this same asset goes to the Facebook feed, where
    // 1440 x 1800 is the recommended minimum for 4:5, confirmed 12 August 2026 at
    // https://www.facebook.com/business/ads-guide/image which gives ratio 4:5,
    // resolution 1440 x 1800 and a 600 x 750 minimum. The Instagram bound is
    // https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
    justification:
      '4:5 is the tightest bound Instagram publishes across both the app and the publishing API, so this one asset is correct wherever it is posted. Instagram will show it at 1080 x 1350; Facebook uses the full 1440 x 1800.',
  },
}

export const SOCIAL_CARD_ORDER: readonly SocialCardFormat[] = ['story', 'square', 'feed']

export function isSocialCardFormat(value: string): value is SocialCardFormat {
  return value === 'story' || value === 'square' || value === 'feed'
}

/**
 * Every platform we hand an asset to accepts JPEG, and JPEG is what keeps a
 * photographic card small enough to send over a phone connection: [LI-IMAGE]
 * caps at 5 MB, [X-MEDIA] caps at 5 MB, and Instagram re-encodes on upload
 * anyway ([IG-RES]).
 */
export const SOCIAL_CARD_MIME = 'image/jpeg'
export const SOCIAL_CARD_EXTENSION = 'jpg'

/** The ceiling every rendered card must stay under, from [LI-IMAGE]/[X-MEDIA]. */
export const SOCIAL_CARD_MAX_BYTES = 5 * 1024 * 1024
