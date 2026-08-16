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
 * for: what it costs and where to buy.
 *
 * "www." is dropped. Every browser has hidden it in the address bar for years,
 * it carries no information a reader needs, and on the story bar those four
 * characters are the difference between the line fitting and being drawn
 * outside its own bar.
 */
export function ticketBarText(
  priceLabel: string,
  shortUrl: string,
  /**
   * The host to PRINT, when it differs from the host the link resolves against.
   *
   * A preview deployment's own hostname is 70 characters long
   * (`eventlinqs-app-git-integration-launch-lawals-projects-...vercel.app`), and
   * an artefact is a thing a promoter prints and posts. Printing that host is
   * useless to a reader and it is what forced the ellipsis this bar used to
   * emit. The QR code and the caption links still carry the REAL url, so a
   * preview artefact still resolves; only the printed line is canonicalised.
   */
  displayHost?: string,
): string {
  const bare = shortUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const swapped = displayHost
    ? bare.replace(/^[^/]+/, displayHost.replace(/^https?:\/\//, '').replace(/\/$/, ''))
    : bare
  const url = swapped.replace(/^www\./, '')
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

/**
 * Break a string into lines that each fit a width, using a real measurer.
 *
 * A near-twin of `wrapText` in poster.ts lives here rather than being shared,
 * and the duplication is deliberate: that one takes a pdf-lib font object and
 * serves the PDF, this one takes a measure function and serves satori. Merging
 * them would put the poster's artwork composition, which the founder required to
 * render identically before and after, on the same code path as a card change.
 * Two small functions beat one shared one that nobody dares touch.
 */
function wrapToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: (text: string, fontSize: number) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate, fontSize) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

export type DisplayTitleFit = { fontSize: number; lines: string[]; leading: number }

/**
 * THE HEADLINE OF THE ARTWORK-FREE CARD, FITTED TO ITS BOX.
 *
 * WHY THIS EXISTS. With no photograph the card fell back to the same small
 * headline it uses under artwork, and the frame then had nothing in it. On the
 * 1440 x 1800 tall post that left roughly a third of the card as empty navy
 * between the venue line and the call to action, with a second void above the
 * headline; the square and the story carried smaller versions of it. A promoter
 * reads that as a template with a gap, not as a poster.
 *
 * The A4 poster already solved this exact problem and its reasoning is the
 * reasoning here (see fitPosterTitle in poster.ts): the ceiling is the BOX, not
 * a hand-picked point size. A short name grows until it spans the width, which
 * is what makes the type itself the artwork; a long one steps down and wraps
 * across more lines. Fitting type to a space is what a designer does by hand,
 * and it is deterministic composition, so Law 6 is untouched. Nothing is
 * generated: the words are the organiser's own.
 *
 * Returns the LINES as well as the size, because the caller draws each one as
 * its own element. That keeps the renderer from wrapping differently to the
 * measurement and quietly overflowing the box.
 */
export function fitDisplayTitle(
  title: string,
  opts: { maxWidth: number; maxHeight: number; maxLines: number; max: number; min: number },
  measure: (text: string, fontSize: number) => number,
): DisplayTitleFit {
  const clean = title.trim().replace(/\s+/g, ' ')
  const leadingFor = (size: number) => size * 1.06

  /** Whether every word stands alone on a line at this size, unbroken. */
  const wordsStayWhole = (size: number) =>
    clean
      .split(' ')
      .filter(Boolean)
      .every(word => measure(word, size) <= opts.maxWidth)

  const tryFit = (size: number): DisplayTitleFit | null => {
    const lines = wrapToWidth(clean, opts.maxWidth, size, measure)
    if (lines.length > opts.maxLines) return null
    const leading = leadingFor(size)
    return lines.length * leading <= opts.maxHeight ? { fontSize: size, lines, leading } : null
  }

  // Pass 1: the largest size at which NO word has to be broken. Preferred
  // always, because a title split mid-word reads as a bug rather than as
  // design. This is the pass that stopped the poster rendering "Ruby's 16th" as
  // "Ruby'" / "s 16th".
  for (let size = Math.floor(opts.max); size >= opts.min; size -= 1) {
    if (!wordsStayWhole(size)) continue
    const fit = tryFit(size)
    if (fit) return fit
  }

  // Pass 2: some token is wider than the line at every size, a pasted URL being
  // the realistic case, so it has to break. Still take the LARGEST size that
  // fits rather than dropping to the floor.
  for (let size = Math.floor(opts.max); size >= opts.min; size -= 1) {
    const fit = tryFit(size)
    if (fit) return fit
  }

  // Nothing fits. Take the floor and clamp the line count so a pathological
  // title stops cleanly instead of running out of the frame.
  const fontSize = opts.min
  return {
    fontSize,
    lines: wrapToWidth(clean, opts.maxWidth, fontSize, measure).slice(0, opts.maxLines),
    leading: leadingFor(fontSize),
  }
}

export type TicketBarFit = { lines: string[]; fontSize: number }

/**
 * Fit the ticket line to the bar. One line wherever one line will do, which is
 * every address the platform prints today; a second line only where the
 * alternative would be cutting the address.
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
 * the fit is now GUARANTEED. The caller draws the returned lines, never the
 * input.
 *
 * THE BAR MAY NOW TAKE A SECOND LINE (founder ruling 2026-08-13), and that is
 * what finally removes the cut. The ellipsis path that used to sit at the bottom
 * of this function printed things like
 * `eventlinqs-app-g...l.app/launch/k/a8kwsh5fapxw`, which is not an address
 * anybody can type, scan past or trust: a promoter posting that looks like they
 * are running a scam. It only existed to protect an older invariant, that the
 * line never draws outside its own bar, because a line drawn past the gold is
 * navy on navy on the poster and prints a silently shortened address that
 * resolves to nothing. A second line keeps that invariant AND keeps the address
 * whole, so the cut has nothing left to protect and is gone.
 *
 * THE ORDER OF SACRIFICE, unchanged above the last step so that nothing which
 * fits today renders differently tomorrow:
 *
 *   1. the whole line, one row, stepping the size down to the floor
 *   2. the price prefix dropped, one row, from the top again: a reader gets the
 *      price from the card body and the caption, and cannot get the address
 *      from anywhere else
 *   3. the address alone, below the floor, to an absolute hard floor
 *   4. the address across TWO rows, broken at a path boundary where there is
 *      one. Never an ellipsis, at any size, ever.
 *
 * Steps 2 to 4 are unreachable for anything the platform prints today, because
 * both renderers pass printableHost() and the canonical host is seventeen
 * characters. They exist for the preview hosts and the long codes that made this
 * function necessary in the first place.
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
    if (measure(text, size) <= availableWidth) return { lines: [text], fontSize: size }
  }

  const urlOnly = text.includes(' · ') ? text.slice(text.indexOf(' · ') + 3) : text
  if (urlOnly !== text) {
    for (let size = maxFontSize; size >= minFontSize; size -= 1) {
      if (measure(urlOnly, size) <= availableWidth) return { lines: [urlOnly], fontSize: size }
    }
  }

  // Still too wide. Keep shrinking the address alone. The floor is deliberately
  // low: a small but complete address beats a large broken one.
  const hardFloor = Math.max(8, Math.round(minFontSize * 0.6))
  for (let size = minFontSize - 1; size >= hardFloor; size -= 1) {
    if (measure(urlOnly, size) <= availableWidth) return { lines: [urlOnly], fontSize: size }
  }

  // TWO ROWS. Broken after a slash where there is one, because a reader
  // re-joining `eventlinqs.com.au/` and `launch/k/a8kwsh5fapxw` across a line
  // break can see where the join goes; a break in the middle of a word cannot be
  // read back at all. Falls back to the midpoint when the address has no usable
  // boundary, which a bare host does not.
  const splitPoints: number[] = []
  for (let i = 0; i < urlOnly.length; i += 1) {
    if (urlOnly[i] === '/') splitPoints.push(i + 1)
  }
  if (splitPoints.length === 0) splitPoints.push(Math.ceil(urlOnly.length / 2))

  for (let size = maxFontSize; size >= 4; size -= 1) {
    // The break nearest the middle keeps the two rows closest in length, which
    // is what stops the second row reading as an afterthought.
    const target = urlOnly.length / 2
    const ordered = [...splitPoints].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
    for (const at of ordered) {
      const head = urlOnly.slice(0, at)
      const tail = urlOnly.slice(at)
      if (!head || !tail) continue
      if (measure(head, size) <= availableWidth && measure(tail, size) <= availableWidth) {
        return { lines: [head, tail], fontSize: size }
      }
    }
  }

  // Genuinely nothing fits, which needs a bar narrower than a few characters.
  // Return the address whole at the smallest size rather than inventing a cut:
  // the invariant this protects is about not printing a WRONG address, and a
  // bar this size is a layout fault to be fixed, not a link to be mangled.
  return { lines: [urlOnly], fontSize: 4 }
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
