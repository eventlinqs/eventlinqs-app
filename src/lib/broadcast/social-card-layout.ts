import { SOCIAL_CARD_FORMATS, type SocialCardFormat } from '@/lib/broadcast/social-card-spec'

/**
 * The pure geometry and text-fitting decisions behind the social cards, kept
 * out of the JSX so they can be asserted in unit tests without rendering a
 * pixel. Everything here is deterministic: same event in, same layout out.
 */

/** Trim to a word boundary, never mid-word, and only when it actually helps. */
export function clampWords(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= maxChars) return clean
  const cut = clean.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  const stem = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:\s]+$/, '')
  return `${stem}...`
}

export type TitleFit = { text: string; fontSize: number }

/**
 * Title scale by length. A short name gets the full display scale; a long one
 * steps down rather than wrapping into a paragraph. The steps are per layout
 * because the story has a whole vertical frame to work with and the banded
 * formats have a fixed band.
 */
export function fitTitle(title: string, format: SocialCardFormat): TitleFit {
  const scale = SOCIAL_CARD_FORMATS[format].width / 1080
  const ladder: { max: number; size: number }[] =
    format === 'story'
      ? [
          { max: 26, size: 108 },
          { max: 46, size: 90 },
          { max: 72, size: 76 },
          { max: 104, size: 64 },
        ]
      : [
          { max: 22, size: 64 },
          { max: 40, size: 55 },
          { max: 64, size: 47 },
          { max: 92, size: 40 },
        ]
  const hardCap = format === 'story' ? 132 : 116
  const text = clampWords(title, hardCap)
  const step = ladder.find(entry => text.length <= entry.max) ?? ladder[ladder.length - 1]
  return { text, fontSize: Math.round(step.size * scale) }
}

/**
 * The gold ticket bar carries the two things a promoter is actually posting
 * for: what it costs and where to buy. One line, never wrapped.
 */
export function ticketBarText(priceLabel: string, shortUrl: string): string {
  const url = shortUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const price = priceLabel.trim()
  return price ? `${price} · ${url}` : url
}

/**
 * The vertical band the story content may occupy: below the platform chrome at
 * the top, above the reply bar at the bottom. Returns the pixel bounds so a
 * test can assert the composition never crosses them.
 */
export function storySafeBand(): { top: number; bottom: number; height: number } {
  const spec = SOCIAL_CARD_FORMATS.story
  const top = spec.safeTop
  const bottom = spec.height - spec.safeBottom
  return { top, bottom, height: bottom - top }
}

/**
 * THE PANEL RULE. A photograph whose width divided by its height is at or
 * under this bleeds to the full 9:16 story frame, because the crop takes
 * little. Anything wider, which is nearly every phone photograph taken
 * sideways and nearly every press shot, is placed whole instead. 0.85 sits
 * just above a 4:5 portrait (0.80) and well under a square (1.0), so portrait
 * uploads bleed and square or landscape uploads are shown entire.
 */
export const STORY_PANEL_RATIO_THRESHOLD = 0.85

/**
 * The tallest a whole photograph may be inside the story. The panel starts at
 * the very top of the frame, because a photograph under the platform's own
 * header is normal and only text and logos must stay out of that strip. What
 * is left has to hold the type composition and the 250 pixel bottom safe area,
 * which needs roughly 1100 pixels. A 16:9 photograph is 608 tall at 1080 wide
 * and is never touched; a square one is trimmed to this.
 */
export const STORY_PANEL_MAX_HEIGHT = 820

/** Photo crop box for a format: what sharp is asked to produce. */
export function photoBox(format: SocialCardFormat): { width: number; height: number } {
  const spec = SOCIAL_CARD_FORMATS[format]
  return {
    width: spec.width,
    height: spec.photoHeight > 0 ? spec.photoHeight : spec.height,
  }
}

/** Download filename for a rendered card: readable, sortable, no collisions. */
export function cardFilename(slug: string, format: SocialCardFormat, extension: string): string {
  const safeSlug = slug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return `${safeSlug || 'event'}-${format}.${extension}`
}
