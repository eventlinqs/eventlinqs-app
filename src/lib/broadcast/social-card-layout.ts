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
 *
 * "www." is dropped. Every browser has hidden it in the address bar for years,
 * it carries no information a reader needs, and on the story bar those four
 * characters are the difference between the line fitting and being drawn
 * outside its own bar.
 */
export function ticketBarText(priceLabel: string, shortUrl: string): string {
  const url = shortUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
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

/**
 * The SHORTEST the story panel may be. A 16:9 photograph placed whole at 1080
 * wide is only 608 tall, which left the composition with a third of the frame
 * as dead navy and read as unfinished beside the square card. The panel is
 * therefore grown to this floor by trimming WIDTH, which is where a landscape
 * photograph has slack, and never below the point where the type below it
 * stops fitting. At the floor a 16:9 frame keeps 87 per cent of its width, so
 * this is a trim, not the two-thirds loss the panel rule exists to prevent.
 */
export const STORY_PANEL_MIN_HEIGHT = 760

export type TicketBarFit = { text: string; fontSize: number }

/**
 * Fit the ticket line to the bar rather than letting it wrap. The bar is one
 * line by design: a link broken across two lines reads as a broken link, not a
 * designed one.
 *
 * WHY THIS WAS REWRITTEN. The first version estimated the width as
 * `characters * size * 0.52` and, when even the minimum size did not fit,
 * RETURNED THE MINIMUM ANYWAY. Nothing truncated and nothing wrapped, so the
 * line was simply drawn past the end of the gold bar: across the QR code and
 * off the edge on the social cards, and in navy-on-navy past the bar's edge on
 * the A4 poster, where it does not look broken at all, it just silently prints
 * a shortened, wrong link. A browser walk found it; 1452 unit tests did not,
 * because a function that returns a plausible number cannot fail an assertion
 * about the number.
 *
 * Two things changed. The width is now MEASURED with the real font rather than
 * estimated (the measured ratio for Hanken Grotesk SemiBold is nearer 0.46, so
 * the old estimate was also shrinking type that did not need shrinking). And
 * the fit is now GUARANTEED: if the line cannot be made to fit by stepping the
 * size down, the URL is ellipsised until it does. The caller draws the returned
 * text, never the input.
 *
 * @param measure returns the drawn width of a string at a font size, from the
 *   real font the caller will draw with, so the guarantee is about the actual
 *   glyphs rather than an average.
 */
export function fitTicketBar(
  text: string,
  availableWidth: number,
  maxFontSize: number,
  minFontSize: number,
  measure: (text: string, fontSize: number) => number,
): TicketBarFit {
  for (let size = maxFontSize; size >= minFontSize; size -= 1) {
    if (measure(text, size) <= availableWidth) return { text, fontSize: size }
  }

  // Nothing fits even at the floor. Shorten from the middle of the line, which
  // is the host, and keep both ends: the price a reader is deciding on and the
  // code that makes the address unique. A visible ellipsis is honest; a line
  // drawn outside its own bar is not.
  let lo = 1
  let hi = text.length
  let best = '...'
  while (lo <= hi) {
    const keep = Math.floor((lo + hi) / 2)
    const head = Math.ceil(keep / 2)
    const tail = keep - head
    const candidate = `${text.slice(0, head)}...${tail > 0 ? text.slice(text.length - tail) : ''}`
    if (measure(candidate, minFontSize) <= availableWidth) {
      best = candidate
      lo = keep + 1
    } else {
      hi = keep - 1
    }
  }
  return { text: best, fontSize: minFontSize }
}

/**
 * The one line of the organiser's own summary the story card carries. The
 * story is the only format with room for it, and a viewer scrolling past
 * needs a reason to stop that a title and a date do not give them. Clamped
 * hard: this is a line, not a paragraph.
 */
export function storyStrapline(summary: string | null | undefined): string | null {
  if (!summary) return null
  const clean = summary.trim().replace(/\s+/g, ' ')
  if (clean.length < 12) return null
  const stop = clean.search(/[.?](\s|$)/)
  const sentence = stop > 0 ? clean.slice(0, stop) : clean
  return clampWords(sentence, 92)
}

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
