import type { Slide } from '@/lib/social/campaign'
import type { SocialPlatform } from '@/lib/social/cadence'
import { SOCIAL_CARD_FORMATS } from '@/lib/broadcast/social-card-spec'
import { destinationOf, imageFacts, misfitOf } from '@/lib/social/destination-specs'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * EVERY IMAGE AGAINST ITS DESTINATION, BEFORE ANY PUBLISHER IS CALLED (the PM's 13:42 of 18 November 2026, P0, law 4).
 * An approved file is read from its own address and measured from its own bytes; a drawn slide is measured by the size
 * the rasteriser draws it at (SOCIAL_CARD_FORMATS, always JPEG). The first image that does not fit is named with its
 * reason; null when every one fits. The destination is the piece's OWN format, the one it will post in, never one guessed
 * from its slides: on 20 November 2026 the guess read a tonight story as a feed, so this check passed what would post
 * wrong (WINDOW 5A's look, the PM's 10:42 item 1).
 */
export async function slidesMisfit(slides: readonly Slide[], platform: SocialPlatform, format: 'feed' | 'story', fetcher: Fetcher): Promise<string | null> {
  const dest = destinationOf(platform, format)
  for (let i = 0; i < slides.length; i += 1) {
    const s = slides[i]
    if (s.t === 'file') {
      let res: Response
      try {
        res = await fetcher(s.url, { cache: 'no-store' })
      } catch (e) {
        return `slide ${i + 1}'s file could not be read (${e instanceof Error ? e.message : String(e)}), so its size for ${platform} is unknown`
      }
      if (!res.ok) return `slide ${i + 1}'s file answers ${res.status}, so its size for ${platform} is unknown`
      const facts = imageFacts(new Uint8Array(await res.arrayBuffer()))
      if (!facts) return `slide ${i + 1}'s file is not an image this check can read`
      const why = misfitOf(dest, facts)
      if (why) return `slide ${i + 1} does not fit ${platform}: ${why}`
      continue
    }
    const drawn = SOCIAL_CARD_FORMATS[format]
    const why = misfitOf(dest, { width: drawn.width, height: drawn.height, bytes: 0, kind: 'jpeg' })
    if (why) return `slide ${i + 1}, drawn at ${drawn.width}x${drawn.height}, does not fit ${platform}: ${why}`
  }
  return null
}
