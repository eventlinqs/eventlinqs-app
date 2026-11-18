import type { SocialPlatform } from '@/lib/social/cadence'

/**
 * WHERE EACH POST GOES, AND WHAT THAT PLACE TAKES (the PM's 13:42 of 18 November 2026, P0, law 4; source
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media: the approved feed
 * files were 1440x1920, 3:4, and Instagram's publishing API refuses anything narrower than 4:5; they were made for hand
 * posting and nothing checked them against their destination). One table, Meta's own pages quoted beside each rule,
 * read on 18 November 2026. No design is made, approved or posted without its destination: the publish run holds any
 * image that does not fit here before the publisher is called (store.ts, publishDuePieces), and the drawn sizes
 * (SOCIAL_CARD_FORMATS) are held to the same table by tests/unit/social/destination-specs.test.ts.
 */

export type Destination = 'instagram_feed' | 'instagram_story' | 'facebook_feed' | 'facebook_story'
export type ImageKind = 'jpeg' | 'png' | 'gif' | 'bmp' | 'tiff' | 'other'
export type ImageFacts = { readonly width: number; readonly height: number; readonly bytes: number; readonly kind: ImageKind }

export type DestinationSpec = {
  readonly kinds: readonly ImageKind[]
  /** Bytes the file must stay under (exclusive), read as decimal megabytes so a file at the edge is never close. */
  readonly underBytes: number
  /** Width over height; null where the destination's page states no range. */
  readonly ratio: { readonly min: number; readonly max: number } | null
  readonly width: { readonly min: number; readonly max: number } | null
  readonly source: string
  readonly quoted: readonly string[]
}

const IG_MEDIA = 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media'
const FB_PHOTOS = 'https://developers.facebook.com/docs/graph-api/reference/page/photos/'

export const DESTINATION_SPECS: Readonly<Record<Destination, DestinationSpec>> = {
  // Instagram feed image, from https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media (Image Specifications).
  instagram_feed: {
    kinds: ['jpeg'],
    underBytes: 8_000_000,
    ratio: { min: 4 / 5, max: 1.91 }, // "Aspect ratio: Must be within a 4:5 to 1.91:1 range", https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
    width: { min: 320, max: 1440 }, // "Minimum width: 320", "Maximum width: 1440", https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
    source: IG_MEDIA,
    quoted: ['Format: JPEG', 'File size: 8 MB maximum.', 'Aspect ratio: Must be within a 4:5 to 1.91:1 range', 'Minimum width: 320 (will be scaled up to the minimum if necessary)', 'Maximum width: 1440 (will be scaled down to the maximum if necessary)'],
  },
  // Instagram story image, from https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media (Story Image Specifications).
  // Meta RECOMMENDS 9:16 "to avoid cropping or blank space" and states no range; we hold a story to 9:16 (within 1%) so
  // an approved story is never cropped, a house rule stricter than Meta's own.
  instagram_story: {
    kinds: ['jpeg'],
    underBytes: 8_000_000,
    ratio: { min: (9 / 16) * 0.99, max: (9 / 16) * 1.01 }, // "We recommended 9:16 to avoid cropping or blank space", https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
    width: null,
    source: IG_MEDIA,
    quoted: ['Format: JPEG', 'File size: 8 MB maximum.', 'Aspect ratio: We recommended 9:16 to avoid cropping or blank space'],
  },
  // A photo in our Facebook Page's feed: the file kinds and size from https://developers.facebook.com/docs/graph-api/reference/page/photos/ (Photo Specifications),
  // which states no ratio. THE RATIO IS LAWAL'S RULING of 18 November 2026, 20:08 (through the PM's 20:15 item 1): a designed post goes to the
  // Facebook feed on the same 4:5 file as the Instagram feed, and a taller file is refused, because the feed showed the 3:4 originals cut and the
  // AMCF square narrower than its words. Meta's own statement that its feed crops taller images to 4:5 is UNSOURCED here: every Meta page answered
  // 400 to a signed out read from the build machine at about 20:12 that day.
  facebook_feed: {
    kinds: ['jpeg', 'bmp', 'png', 'gif', 'tiff'],
    underBytes: 10_000_000,
    ratio: { min: 4 / 5, max: 1.91 }, // Lawal's ruling of 18 November 2026, 20:08; Meta's feed crop to 4:5 UNSOURCED (its pages answer 400 signed out)
    width: null,
    source: `Lawal's ruling of 18 November 2026, 20:08, for the feed; ${FB_PHOTOS} for kinds and size`,
    quoted: ['.jpeg, .bmp, .png, .gif, .tiff', 'Files can not exceed 10MB. For .png files, we recommend not exceeding 1MB or the image may appear pixelated.'],
  },
  // A story on our Facebook Page: Page photos' own rule (https://developers.facebook.com/docs/graph-api/reference/page/photos/), no ratio stated; we post none today.
  facebook_story: {
    kinds: ['jpeg', 'bmp', 'png', 'gif', 'tiff'],
    underBytes: 10_000_000,
    ratio: null,
    width: null,
    source: FB_PHOTOS,
    quoted: ['.jpeg, .bmp, .png, .gif, .tiff', 'Files can not exceed 10MB. For .png files, we recommend not exceeding 1MB or the image may appear pixelated.'],
  },
}

/** The destination of a post: the feed or the story of Instagram or of our Facebook Page, by the slides' format. */
export function destinationOf(platform: SocialPlatform, format: 'feed' | 'story'): Destination {
  if (platform === 'facebook') return format === 'story' ? 'facebook_story' : 'facebook_feed'
  return format === 'story' ? 'instagram_story' : 'instagram_feed'
}

/** An image's kind and size from its own bytes (the JPEG frame header or the PNG header); null when neither is read. */
export function imageFacts(b: Uint8Array): ImageFacts | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { kind: 'png', width: v.getUint32(16), height: v.getUint32(20), bytes: b.length }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1
        continue
      }
      const m = b[i + 1]
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2
        continue
      }
      const len = (b[i + 2] << 8) | b[i + 3]
      // A start of frame (baseline, extended, progressive or lossless) carries the height then the width.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { kind: 'jpeg', height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], bytes: b.length }
      }
      i += 2 + len
    }
    return null
  }
  if (b.length > 2 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { kind: 'gif', width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8), bytes: b.length }
  return null
}

const ratioWords = (r: number) => r.toFixed(3)

/** Why an image does not fit its destination, in plain words, or null when it fits. */
export function misfitOf(dest: Destination, f: ImageFacts): string | null {
  const s = DESTINATION_SPECS[dest]
  const where = dest.replace('_', ' ')
  if (!s.kinds.includes(f.kind)) return `it is a ${f.kind.toUpperCase()} file, which ${where} does not take (${s.kinds.join(', ')}; ${s.source})`
  if (f.bytes >= s.underBytes) return `it is ${f.bytes} bytes, over what ${where} takes (${s.source})`
  if (s.width && (f.width < s.width.min || f.width > s.width.max)) return `it is ${f.width} wide, outside ${where}'s ${s.width.min} to ${s.width.max} (${s.source})`
  if (s.ratio) {
    const r = f.width / f.height
    if (r < s.ratio.min - 1e-9 || r > s.ratio.max + 1e-9) {
      return `it is ${f.width}x${f.height}, ratio ${ratioWords(r)}, outside ${where}'s ${ratioWords(s.ratio.min)} to ${ratioWords(s.ratio.max)} (${s.source})`
    }
  }
  return null
}
