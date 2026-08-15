import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { loadCardFonts } from '@/lib/broadcast/card-fonts'
import { fitTicketBar, ticketBarText } from '@/lib/broadcast/social-card-layout'
import { printableHost } from '@/lib/site-url'

/**
 * The one "when" line the poster prints: date and start time together.
 *
 * Joined the same way the social cards and every caption join them, so the four
 * artefacts of one kit cannot disagree about when the event starts. Both halves
 * arrive already formatted in the event's own timezone.
 */
function posterWhenLine(input: { dateLabel: string; timeLabel?: string | null }): string {
  return [input.dateLabel, input.timeLabel].filter(Boolean).join(', ')
}
import {
  resolvePosterPalette,
  type PosterPaletteName,
} from '@/lib/broadcast/poster-palette'

/**
 * THE A4 QR POSTER.
 *
 * One print-ready A4 poster per event: the organiser's cover photograph, their
 * own mark, the title, date, locality and price, and a large tracked QR, so a
 * poster on a community noticeboard is a measured acquisition channel like any
 * other.
 *
 * TWO COMPOSITIONS, NOT ONE WITH A HOLE IN IT (founder ruling, 9 August 2026).
 *
 * The renderer used to reserve the top 55% of the page for a photograph
 * whether or not a photograph existed. With artwork that is right. Without it,
 * the organiser got half an A4 of empty navy carrying one small line of text,
 * and a promoter reads that as a template with a gap rather than as a designed
 * poster. It was the single worst thing anyone saw in the public composer,
 * where EVERY poster is currently artwork-free.
 *
 * So there are now two genuinely different compositions behind one entry point:
 *
 *   drawCoverPoster       photograph on top, information band below. UNCHANGED,
 *                         byte for byte, and there is a test that proves the
 *                         drawing operators are identical to the previous
 *                         renderer.
 *   drawTypographicPoster the whole page is the composition. The title is the
 *                         hero and is auto-fitted to fill the space it is
 *                         given, so a three-word name prints huge and a long
 *                         one prints smaller across more lines. That is what
 *                         makes it read as deliberate rather than as a default.
 *
 * Law 6 holds and is the reason this exists: the platform never generates an
 * image to fill the gap. It composes type.
 *
 * TWO EARLIER DEFECTS, both still fixed:
 *
 * 1. It carried the EventLinqs wordmark and no organiser logo. A promoter's
 *    poster is the one artefact that goes on a wall with their name on it, and
 *    ours was the only name on it. The organiser mark now leads and ours is one
 *    small footer line.
 * 2. It was set in Helvetica, the PDF standard font, not the brand stack. A
 *    designer reads that instantly as a default. It is now set in Archivo and
 *    Hanken Grotesk, the same faces as the social cards, embedded and subset.
 */

/**
 * Every brand colour now comes from the resolved palette. The only two literals
 * left are these, and they are not brand expression: a logo readability tile
 * and the QR tile are white on EVERY scheme, because their job is contrast
 * against whatever sits behind them. Putting them in the palette would invite
 * somebody to tint them and break a scan.
 */
const PDF_NAVY = rgb(0.039, 0.086, 0.157) // ink-900 #0A1628
const PDF_WHITE = rgb(1, 1, 1)

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48

/**
 * THE QR IS SIZED TO WHAT IT NEEDS TO SCAN, NOT TO WHAT THE LAYOUT ALLOWED.
 *
 * Founder ruling, 15 August 2026, raised as a merge blocker: "the QR must be
 * unobtrusive and never compete with the event. It currently wins outright."
 *
 * It did. Measured off the rendered bytes rather than from the source: the
 * cover composition drew a 140pt code beside a headline hardcoded at 29pt, so
 * the code was 4.83 times the headline's point size. On A4 that is a 49.4mm
 * square of high-contrast black, which is the first thing the eye resolves at
 * any distance, against an event name at 10mm.
 *
 * THE SIZE IS SET FROM THE SCANNING REQUIREMENT, EXPRESSED IN MILLIMETRES,
 * because the requirement is physical: a scanner resolves MODULES, and a module
 * is a printed distance. Points are an accident of the page.
 *
 * WHAT THE PAYLOAD ACTUALLY IS, computed rather than assumed. A tracked short
 * link, `https://www.eventlinqs.com.au/e/<12 chars>`, is 44 characters, which
 * the encoder resolves to QR **version 4 at error correction level M, so 33 x 33
 * modules**. At 30mm that is a 0.909mm module.
 *
 * THE PUBLISHED FLOOR. GS1 General Specifications, Release 26.0 (Ratified,
 * January 2026), Table 5-46, publishes the X-dimension band for a QR Code
 * carrying a GS1 Digital Link URI as **minimum 0.396mm, target 0.495mm**, and
 * scopes it on the following page to "a read range typical of mobile device
 * scanning". The same table records WHY a 2D symbol must be larger than a
 * linear one: "Optical effects in the image capture process require that the
 * Data Matrix and QR Code symbols be printed at 1.5 times the equivalent
 * X-dimension allowed for linear symbols."
 * (https://ref.gs1.org/standards/genspecs/, retrieved 15 August 2026.)
 *
 * So 0.909mm is 2.3 times GS1's published minimum and 1.8 times its target.
 *
 * AUSTRALIAN TRADE PRACTICE, which is not a standard and is labelled as such.
 * DTPS: "QR codes should be printed at a minimum size of 3 x 3 cm with adequate
 * clear space around them for reliable scanning."
 * (https://www.dtps.com.au/poster-printing-services-everything-you-need-to-know/)
 * Same Day Printing: "Minimum size: 20 x 20 mm for close-up use", "Recommended:
 * 30-40 mm or larger for flyers, menus, or signage."
 * (https://samedayprinting.com.au/variable-data-qr-codes/) Both retrieved
 * 15 August 2026. 30mm is the floor of the published poster band, not below it.
 *
 * THE 1:10 "SIZE EQUALS DISTANCE OVER TEN" RULE IS **UNSOURCED** AND IS NOT
 * USED HERE. It appears on no Denso Wave page and in no GS1 specification; every
 * instance found was a QR-generator vendor's own marketing. What Denso Wave
 * actually publishes is a printer-and-scanner rule: "Each scanner has its own
 * readable module size limit" (https://www.qrcode.com/en/howto/cell.html). This
 * is recorded because quoting that rule as a standard is precisely the failure
 * Law 7 exists to stop.
 *
 * THE QUIET ZONE IS PART OF THE SYMBOL, NOT PADDING AROUND IT. Denso Wave:
 * "QR Code requires a four-module wide margin at all sides of a symbol"
 * (https://www.qrcode.com/en/howto/code.html), and GS1 records the same as
 * "4-X surrounding Quiet Zone". The generator bakes in `margin: 1`, so the white
 * tile drawn behind the code has to supply the other three modules. At 30mm on a
 * 33-module symbol the tile needs at least 3 x 0.909mm = 2.7mm, which is 7.7pt;
 * the tile is drawn with 10pt on every side, so the requirement is met with
 * margin. Anything that reduces that padding breaks the symbol, not just its
 * appearance.
 */
const MM = 72 / 25.4
/** Printed side of the QR symbol itself, excluding its white tile. */
const POSTER_QR_MM = 30
const POSTER_QR_PT = Math.round(POSTER_QR_MM * MM)

/**
 * The headline range for the PHOTOGRAPH composition.
 *
 * The floor is the size below which a poster headline stops working across a
 * room. The ceiling exists so a two-word event name does not swallow the band
 * and crush the photograph the organiser uploaded, which is the opposite defect
 * and just as bad. The fitter chooses inside this range against a computed
 * budget; neither bound is hit on a typical title.
 */
const COVER_TITLE_MIN = 26
const COVER_TITLE_MAX = 104

/**
 * Clear air between the organiser's name and the headline's CAP LINE.
 *
 * The headline's ascender is added to this separately, in both the measurement
 * and the drawing. The old code advanced a flat 26 from the organiser baseline
 * and drew the title's baseline there, which worked only because the title was
 * a fixed 29pt. The moment the headline is fitted and reaches 81pt, its
 * ascender rises 58pt above its baseline and prints straight through the
 * organiser's name. That regression appeared on the very first render of the
 * fitted headline, on the no-mark path, which is the common one.
 */
const IDENTITY_TO_TITLE = 20

export type PosterImage = { bytes: Uint8Array; format: 'jpg' | 'png' }

export interface PosterInput {
  title: string
  dateLabel: string
  /**
   * Start time on its own, for example "8:00 pm", already formatted in the
   * EVENT's own timezone by the caller (kit-artefacts formatParts), never the
   * runtime's.
   *
   * The poster printed the date and dropped the time, while all three social
   * cards printed both. The poster is the artefact that goes in a pub window,
   * so it is the one that needs the time most: a reader standing in front of it
   * cannot tap through to find out when doors are.
   */
  timeLabel?: string | null
  locality: string
  priceLabel: string
  shortUrl: string
  /** PNG bytes of the tracked QR code. */
  qrPng: Uint8Array
  /** JPEG or PNG bytes of the cover image, when available and embeddable. */
  coverImage?: PosterImage | null
  /** The organiser's trading name. Always drawn; it is their poster. */
  organiserName: string
  /** The organiser's own mark, when they have uploaded one. */
  organiserLogo?: PosterImage | null
  /**
   * Whether the mark needs a light tile to stay readable on the navy. Measured
   * upstream by resolveLogoPlacement, never guessed.
   */
  logoPlacement?: 'on-navy' | 'on-tile'
  /**
   * Whether to draw the EventLinqs footer line at all. Default true. The
   * founder ruling and the two rendered versions are recorded in
   * docs/design/launch-kit-artefacts/README.md.
   */
  showPlatformMark?: boolean
  /**
   * A NAMED scheme, never a colour. Absent or unknown resolves to the default,
   * which renders byte-identically to every poster made before this existed.
   * See poster-palette.ts for why this is deliberately not a picker.
   */
  palette?: PosterPaletteName | null
}

type Fonts = {
  display: PDFFont
  displayMid: PDFFont
  body: PDFFont
  bodyStrong: PDFFont
}

/** Wrap a line to a width using the font's real metrics. */
function wrapText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
      continue
    }
    // A token wider than the line has no break opportunity, so break it by
    // character. Without this it becomes a single line that runs off the page,
    // and fitPosterTitle accepts it because the fitter counts LINES, not width:
    // a 4000-character title came back at full size on one line. Real triggers
    // are a pasted URL and a long unspaced hashtag run, not just pathological
    // input. Both compositions call this, so both had the overflow.
    let chunk = ''
    for (const char of word) {
      if (chunk && font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk += char
      }
    }
    current = chunk
  }
  if (current) lines.push(current)
  return lines
}

/** Letter-spaced small caps, drawn glyph by glyph because pdf-lib has no tracking. */
function drawTracked(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; tracking: number },
): number {
  let x = opts.x
  for (const char of text) {
    page.drawText(char, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color })
    x += opts.font.widthOfTextAtSize(char, opts.size) + opts.tracking
  }
  return x - opts.x
}

async function embed(doc: PDFDocument, image: PosterImage): Promise<PDFImage> {
  return image.format === 'png' ? doc.embedPng(image.bytes) : doc.embedJpg(image.bytes)
}

/**
 * The largest display size at which the title fills its box without
 * overflowing it.
 *
 * This is the whole trick of the typographic poster. A fixed size makes a
 * short title look lost and a long one overflow, which is exactly how a
 * template announces itself. Fitting the type to the space is what a designer
 * does by hand, and it is deterministic composition, not generation.
 *
 * Exported so the test can assert the fit rather than eyeball it.
 */
export function fitPosterTitle(
  title: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  opts: { maxWidth: number; maxHeight: number; maxLines: number; max: number; min: number },
): { size: number; lines: string[]; leading: number } {
  /** Whether every word stands alone on a line at this size, unbroken. */
  const wordsStayWhole = (size: number) =>
    title
      .split(/\s+/)
      .filter(Boolean)
      .every(word => font.widthOfTextAtSize(word, size) <= opts.maxWidth)

  const tryFit = (size: number): { size: number; lines: string[]; leading: number } | null => {
    const lines = wrapText(title, font, size, opts.maxWidth)
    if (lines.length > opts.maxLines) return null
    const leading = size * 1.08
    return lines.length * leading <= opts.maxHeight ? { size, lines, leading } : null
  }

  // Pass 1: the largest size at which NO word has to be broken. Preferred
  // always, because a title split mid-word reads as a bug rather than as
  // design. Letting the fitter grow until the box was full, without this pass,
  // rendered "Ruby's 16th" as "Ruby'" / "s 16th".
  for (let size = opts.max; size >= opts.min; size -= 1) {
    if (!wordsStayWhole(size)) continue
    const fit = tryFit(size)
    if (fit) return fit
  }

  // Pass 2: some token is wider than the line at every size, so it has to be
  // broken. A pasted URL is the realistic case. Still take the LARGEST size
  // that fits rather than dropping to the floor, which would print a legible
  // title tiny for no reason.
  for (let size = opts.max; size >= opts.min; size -= 1) {
    const fit = tryFit(size)
    if (fit) return fit
  }
  // Nothing fits: take the floor and clamp the line count, so a pathological
  // title truncates cleanly rather than running off the page.
  const size = opts.min
  const leading = size * 1.08
  return {
    size,
    lines: wrapText(title, font, size, opts.maxWidth).slice(0, opts.maxLines),
    leading,
  }
}

/* ------------------------------------------------------------------ */
/* Composition 1: with a photograph. UNCHANGED.                        */
/* ------------------------------------------------------------------ */

/**
 * The photograph composition, preserved exactly as it shipped.
 *
 * Every number, every draw order and every branch in here is the original. The
 * founder's condition on this work was that the artwork path renders
 * identically before and after, and the way to keep that promise is to not
 * touch it, which is why this reads as a lift rather than a rewrite.
 */
async function drawCoverPoster(
  doc: PDFDocument,
  page: PDFPage,
  input: PosterInput & { coverImage: PosterImage },
  fonts: Fonts,
): Promise<void> {
  const { display, displayMid, body, bodyStrong } = fonts
  const pal = resolvePosterPalette(input.palette)

  const logo = input.organiserLogo ? await embed(doc, input.organiserLogo) : null
  const onTile = input.logoPlacement !== 'on-navy'

  const qrSize = POSTER_QR_PT
  const qrX = PAGE_W - MARGIN - qrSize
  const textMaxW = qrX - MARGIN - 24

  const localityLines = input.locality
    ? wrapText(input.locality, body, 12.5, textMaxW).slice(0, 2)
    : []
  const barH = 30
  // Clear of the shared platform footer, which both compositions draw at an
  // absolute y of 30.
  const BAND_BOTTOM_PAD = 46
  const BAND_MAX = PAGE_H * 0.45

  /* ---- THE HEADLINE IS FITTED, NOT FIXED (founder ruling, 15 Aug 2026) ------
   *
   * It used to be a hardcoded 29pt on every poster ever made by this platform,
   * while the QR beside it was drawn at 140pt. Measured off the rendered bytes:
   * the code was 4.83 TIMES the headline's point size, so on an A4 sheet in a
   * shop window the first thing a passer-by resolved from three metres was a
   * black and white machine-readable square, and the event's name was smaller
   * than the venue name on an ordinary gig poster.
   *
   * The artwork-free composition never had this problem. It has always fitted
   * its headline, reaching 145pt against a 132pt code, a ratio of 0.91. So the
   * defect was not the design, it was that the PHOTOGRAPH composition never got
   * the fitter the other one had.
   *
   * The budget is computed rather than guessed: measure everything in the band
   * that is NOT the headline, subtract it from the band's own ceiling, and give
   * the headline what is left. That keeps the band's existing behaviour, which
   * is that it sizes to its content and the photograph takes the rest, while
   * making the headline the element that gets first call on the space.
   */
  const logoH = logo ? Math.min(34, (logo.height / logo.width) * 120) : 0
  const logoTilePad = logo && onTile ? 6 : 0

  let chrome = 44
  chrome += logo ? logoH + logoTilePad + 22 : IDENTITY_TO_TITLE
  chrome += 22
  chrome += localityLines.length * 18
  chrome += 14
  chrome += barH - 8
  chrome += BAND_BOTTOM_PAD

  const headlineBudget = Math.max(BAND_MAX - chrome, COVER_TITLE_MIN * 1.08)

  const titleFit = fitPosterTitle(input.title, display, {
    maxWidth: textMaxW,
    maxHeight: headlineBudget,
    maxLines: 3,
    max: COVER_TITLE_MAX,
    min: COVER_TITLE_MIN,
  })
  const titleSize = titleFit.size
  const titleLines = titleFit.lines
  const titleLeading = titleFit.leading
  // Title metrics are needed BEFORE the mark is placed: pdf-lib draws text from
  // its baseline, so the gap under the mark has to clear the title's ascender,
  // not the baseline.
  const titleAscent = display.heightAtSize(titleSize, { descender: false })

  /* ---- THE BAND SIZES ITSELF TO ITS CONTENT (founder ruling, 9 Aug 2026) ----
   *
   * It used to be a flat 45% of the page whatever it held, so a short title
   * left about a third of it as empty navy. That is the same defect the
   * typographic composition was built to remove, and a promoter reads it as a
   * template rather than as a poster.
   *
   * The band is now measured and the PHOTOGRAPH takes whatever it does not
   * need, which is the stronger element on the page and the reason an organiser
   * uploaded anything at all.
   *
   * The measurement below replays EXACTLY the advances the drawing further down
   * makes, with the band top at zero, so the two can never drift apart. Every
   * spacing constant is unchanged; only the height they add up to is new.
   */
  /**
   * The gap under the LAST headline baseline.
   *
   * Advancing a full leading after the final line, which is what the loop used
   * to do, leaves a whole empty line of navy under the headline. At 29pt that
   * was 34pt and went unnoticed; at 81pt it is 87pt of dead region directly
   * under the biggest thing on the page, which is exactly where the eye goes
   * next. It scales with the headline rather than being a constant, so the
   * relationship holds at every size the fitter can choose.
   */
  const titleBlockGap = Math.max(26, Math.round(titleSize * 0.42) + 10)

  let measured = 44
  if (logo) {
    measured += logoH + logoTilePad + 22
  } else {
    measured += IDENTITY_TO_TITLE
  }
  // The ascender belongs to the title in BOTH branches. It was previously added
  // only in the logo branch, so with a fitted headline the organiser's name and
  // the headline's cap line collided on every poster without a mark.
  measured += titleAscent
  measured += (titleLines.length - 1) * titleLeading
  measured += titleBlockGap
  measured += 22
  measured += localityLines.length * 18
  measured += 14
  measured += barH - 8 // the ticket bar's lowest drawn edge

  // The QR column: 60 below the band top, the code itself, its label 26 under
  // that, plus air for the descender. It no longer SETS the floor in practice,
  // because a fitted headline is now the taller of the two on almost every
  // poster, which is the point of the change.
  const qrColumnH = 60 + qrSize + 26 + 6

  const bandH = Math.min(Math.max(measured, qrColumnH) + BAND_BOTTOM_PAD, BAND_MAX)
  const imageRegionH = PAGE_H - bandH

  // Canvas: full-page navy so any gap reads as brand, never as white.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: pal.field })

  const embedded = await embed(doc, input.coverImage)
  // Cover-fit into the top region, centred, overflow cropped by the band.
  const scale = Math.max(PAGE_W / embedded.width, imageRegionH / embedded.height)
  const w = embedded.width * scale
  const h = embedded.height * scale
  page.drawImage(embedded, {
    x: (PAGE_W - w) / 2,
    y: PAGE_H - h + (h - imageRegionH) / 2,
    width: w,
    height: h,
  })

  // The information band, drawn OVER the photograph so a cover-fit overflow is
  // cleanly cropped by its edge.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: bandH, color: pal.field })
  page.drawRectangle({ x: 0, y: bandH - 3, width: PAGE_W, height: 3, color: pal.accent })

  let y = bandH - 44

  // The organiser identity leads the band. Their mark, their name.
  if (logo) {
    const lh = logoH
    const lw = (logo.width / logo.height) * lh
    // A dark mark gets a white readability tile, and the tile is TALLER than
    // the mark by this padding on each side. Advancing by the mark's height
    // alone drew the tile's lower edge straight through the top of the title:
    // clean for a light mark, overlapping for every dark one, which is the
    // case the settings panel explicitly tells organisers is fine.
    const tilePad = onTile ? 6 : 0
    if (onTile) {
      page.drawRectangle({
        x: MARGIN - tilePad,
        y: y - lh - tilePad,
        width: lw + tilePad * 2,
        height: lh + tilePad * 2,
        color: PDF_WHITE,
      })
    }
    page.drawImage(logo, { x: MARGIN, y: y - lh, width: lw, height: lh })
    drawTracked(page, input.organiserName.toUpperCase(), {
      x: MARGIN + lw + 16,
      y: y - lh / 2 - 3,
      size: 10,
      font: displayMid,
      color: pal.textMuted,
      tracking: 1.2,
    })
    // 22pt of clear air between the mark's lowest drawn edge and the title's
    // cap line, whichever placement the mark took.
    y = y - lh - tilePad - 22 - titleAscent
  } else {
    drawTracked(page, input.organiserName.toUpperCase(), {
      x: MARGIN,
      y,
      size: 11,
      font: displayMid,
      color: pal.textMuted,
      tracking: 1.4,
    })
    // Clear the headline's ASCENDER, not just its baseline. A flat 26 was
    // enough while the headline was fixed at 29pt and overlaps it the moment
    // the headline is fitted.
    y -= IDENTITY_TO_TITLE + titleAscent
  }

  // Title, wrapped, at most three lines. Measured above, drawn here, on the
  // SAME leading and the SAME trailing gap the measurement used, so the two
  // cannot drift.
  titleLines.forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y, size: titleSize, font: display, color: pal.text })
    if (i < titleLines.length - 1) y -= titleLeading
  })

  y -= titleBlockGap
  page.drawText(posterWhenLine(input), { x: MARGIN, y, size: 14, font: bodyStrong, color: pal.accent })
  y -= 22
  for (const line of localityLines) {
    page.drawText(line, { x: MARGIN, y, size: 12.5, font: body, color: pal.textMuted })
    y -= 18
  }

  // The gold ticket bar: price and the tracked link, one call to action, the
  // same device the social cards use.
  // The bar is capped at textMaxW, so the LINE has to be fitted to that cap.
  // Before this it was not: the rectangle stopped at the cap and the text kept
  // going, drawn in navy on navy past the gold. That does not read as broken,
  // which is what made it dangerous, because the poster then prints a silently
  // shortened address that resolves to nothing.
  const barPad = 20
  const barSizeMax = 12
  const barFit = fitTicketBar(
    // printableHost, not the deployment host: this line goes on a pub wall.
    ticketBarText(input.priceLabel, input.shortUrl, printableHost()),
    textMaxW - barPad * 2,
    barSizeMax,
    9,
    (text, size) => bodyStrong.widthOfTextAtSize(text, size),
  )
  const barW = Math.min(
    Math.max(...barFit.lines.map(line => bodyStrong.widthOfTextAtSize(line, barFit.fontSize))) +
      barPad * 2,
    textMaxW,
  )
  y -= 14
  if (barFit.lines.length === 1) {
    // THE ONE-LINE CASE IS THE ORIGINAL, statement for statement. This
    // composition is required to render identically before and after, and
    // poster-parity proves it by comparing drawing operators, so an equivalent
    // rewrite is not good enough here even when the arithmetic agrees.
    page.drawRectangle({
      x: MARGIN,
      y: y - barH + 8,
      width: barW,
      height: barH,
      color: pal.accent,
    })
    page.drawText(barFit.lines[0]!, {
      x: MARGIN + barPad,
      y: y - barH + 19,
      size: barFit.fontSize,
      font: bodyStrong,
      color: pal.onAccent,
    })
  } else {
    // Two rows, only reachable on an address no permitted size holds on one
    // line. The bar grows UPWARD from the same lower edge, so everything below
    // it, the QR label and the platform footer, keeps its position.
    const rowH = barFit.fontSize * 1.35
    const tallH = rowH * barFit.lines.length + 12
    const bottom = y - barH + 8
    page.drawRectangle({ x: MARGIN, y: bottom, width: barW, height: tallH, color: pal.accent })
    barFit.lines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN + barPad,
        y: bottom + tallH - 6 - rowH * index - barFit.fontSize,
        size: barFit.fontSize,
        font: bodyStrong,
        color: pal.onAccent,
      })
    })
  }

  // The tracked QR block.
  const qrImage = await doc.embedPng(input.qrPng)
  const qrY = bandH - 60 - qrSize
  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    color: PDF_WHITE,
  })
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })
  const scanLabel = 'Scan for tickets'
  page.drawText(scanLabel, {
    x: qrX + (qrSize - bodyStrong.widthOfTextAtSize(scanLabel, 11)) / 2,
    y: qrY - 26,
    size: 11,
    font: bodyStrong,
    color: pal.accent,
  })
}

/* ------------------------------------------------------------------ */
/* Composition 2: no photograph. The whole page is the composition.    */
/* ------------------------------------------------------------------ */

/**
 * The typographic poster.
 *
 * It is one composition over the full page rather than a photograph region and
 * a band, because there is no photograph and a reserved empty region is the
 * defect this replaces.
 *
 * Reading order down the page:
 *   the organiser's mark and name, small, at the top, because it is their
 *   poster and the eye should land on whose night it is first;
 *   a hairline gold rule, which is the only structural line on the page;
 *   THE TITLE, auto-fitted to fill everything between that rule and the
 *   details, which is what makes a short name print big and read as a poster
 *   rather than as a form;
 *   the date in gold, the locality under it;
 *   the gold ticket bar and the tracked QR, side by side on the baseline.
 */
async function drawTypographicPoster(
  doc: PDFDocument,
  page: PDFPage,
  input: PosterInput,
  fonts: Fonts,
): Promise<void> {
  const { display, displayMid, body, bodyStrong } = fonts
  const pal = resolvePosterPalette(input.palette)
  const contentW = PAGE_W - MARGIN * 2

  // A single deep-navy field. One flat colour over the whole page, so nothing
  // on it reads as a region that was meant to hold something else.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: pal.fieldDeep })

  const logo = input.organiserLogo ? await embed(doc, input.organiserLogo) : null
  const onTile = input.logoPlacement !== 'on-navy'

  /* ---- the baseline block, measured first so the title knows its space ---- */

  const qrSize = 132
  const qrX = PAGE_W - MARGIN - qrSize
  const qrY = MARGIN + 34

  const qrImage = await doc.embedPng(input.qrPng)
  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    color: pal.text,
  })
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })
  const scanLabel = 'Scan for tickets'
  page.drawText(scanLabel, {
    x: qrX + (qrSize - bodyStrong.widthOfTextAtSize(scanLabel, 10.5)) / 2,
    y: qrY - 24,
    size: 10.5,
    font: bodyStrong,
    color: pal.accent,
  })

  // The left column of the baseline block shares the row with the QR, so it is
  // measured against the QR's left edge rather than the page.
  const detailMaxW = qrX - MARGIN - 28

  const barPad = 20
  const barFit = fitTicketBar(
    // printableHost, not the deployment host: this line goes on a pub wall.
    ticketBarText(input.priceLabel, input.shortUrl, printableHost()),
    detailMaxW - barPad * 2,
    12,
    9,
    (text, size) => bodyStrong.widthOfTextAtSize(text, size),
  )
  const barW = Math.min(
    Math.max(...barFit.lines.map(line => bodyStrong.widthOfTextAtSize(line, barFit.fontSize))) +
      barPad * 2,
    detailMaxW,
  )
  // One row keeps the original height exactly. A second row is only reached by
  // an address no permitted size holds on one line, and the bar grows upward
  // from the same baseline, which is why the details above it are measured from
  // `barH` rather than from a constant.
  const barRowH = barFit.fontSize * 1.35
  const barH = barFit.lines.length === 1 ? 32 : Math.round(barRowH * barFit.lines.length + 13)
  const barY = qrY + 2
  page.drawRectangle({ x: MARGIN, y: barY, width: barW, height: barH, color: pal.accent })
  if (barFit.lines.length === 1) {
    page.drawText(barFit.lines[0]!, {
      x: MARGIN + barPad,
      y: barY + 11,
      size: barFit.fontSize,
      font: bodyStrong,
      color: pal.onAccent,
    })
  } else {
    barFit.lines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN + barPad,
        y: barY + barH - 7 - barRowH * index - barFit.fontSize,
        size: barFit.fontSize,
        font: bodyStrong,
        color: pal.onAccent,
      })
    })
  }

  // Locality sits above the bar, date above that, both in the left column.
  let detailY = barY + barH + 26
  const localityLines = input.locality
    ? wrapText(input.locality, body, 13, detailMaxW).slice(0, 2)
    : []
  // Drawn bottom-up so the block grows upward from the bar.
  for (let i = localityLines.length - 1; i >= 0; i -= 1) {
    page.drawText(localityLines[i]!, {
      x: MARGIN,
      y: detailY,
      size: 13,
      font: body,
      color: pal.textMuted,
    })
    detailY += 19
  }

  if (input.dateLabel) {
    page.drawText(posterWhenLine(input), {
      x: MARGIN,
      y: detailY,
      size: 17,
      font: bodyStrong,
      color: pal.accent,
    })
    detailY += 30
  }

  /* ---- the identity block at the top ---- */

  let topY = PAGE_H - MARGIN
  if (logo) {
    const lh = Math.min(52, (logo.height / logo.width) * 180)
    const lw = (logo.width / logo.height) * lh
    const tilePad = onTile ? 8 : 0
    if (onTile) {
      page.drawRectangle({
        x: MARGIN - tilePad,
        y: topY - lh - tilePad,
        width: lw + tilePad * 2,
        height: lh + tilePad * 2,
        color: pal.text,
      })
    }
    page.drawImage(logo, { x: MARGIN, y: topY - lh, width: lw, height: lh })
    topY = topY - lh - tilePad - 26
  } else {
    topY -= 14
  }

  if (input.organiserName) {
    drawTracked(page, input.organiserName.toUpperCase(), {
      x: MARGIN,
      y: topY,
      size: 12,
      font: displayMid,
      color: pal.textMuted,
      tracking: 1.6,
    })
    topY -= 22
  }

  // The one structural line on the page.
  page.drawRectangle({ x: MARGIN, y: topY, width: contentW, height: 2, color: pal.accent })

  /* ---- THE TITLE, filling everything left between the two blocks ---- */

  const titleTop = topY - 30

  /*
   * THE HEADLINE HAS TO CLEAR THE QR, NOT JUST THE LEFT COLUMN (founder walk,
   * 13 August 2026).
   *
   * The floor used to be `detailY + 8`, which is eight points above the DATE
   * line. That measures the left column only, and the title is set across the
   * FULL content width. The QR block sits to the right and its white tile
   * reaches to qrY + qrSize + 10, which is about twenty five points ABOVE that
   * floor. So the bottom of the title box overlapped the QR: a six line title
   * already sat flush against it and a longer one would have printed the last
   * line straight through the code, which is a poster on a wall with an
   * unscannable QR on it.
   *
   * The floor is now the higher of the two blocks the headline shares the page
   * with, plus real clear air. Eight points was never clearance; it was the
   * rounding left over from measuring the wrong thing.
   */
  const TITLE_GUTTER = 26
  const qrBlockTop = qrY + qrSize + 10
  const titleBottom = Math.max(detailY, qrBlockTop) + TITLE_GUTTER
  const available = Math.max(titleTop - titleBottom, 60)

  const fit = fitPosterTitle(input.title, display, {
    maxWidth: contentW,
    maxHeight: available,
    maxLines: 6,
    // The ceiling is the BOX, not a fixed point size. A fixed 68pt ceiling was
    // the reason a short name still left a hole: "Ruby's 16th" fits on one line
    // at 68pt immediately, so the fitter stopped there and drew one small line
    // optically centred in a 400pt space, with dead navy above and below it.
    // That is the same defect the typographic composition was built to remove,
    // just moved from half the page into two thirds of it.
    //
    // A single line can be at most available/leading tall and still fit, so
    // that is the real upper bound. Everything narrower is bound by the width
    // instead, which is what makes a short title grow until it spans the page
    // and a long one step down and wrap. Width and height are the design; a
    // point size chosen by hand is not.
    max: Math.floor(available / 1.08),
    min: 22,
  })

  // Optically centre the title in its box rather than hanging it from the top,
  // so a two-line name on a tall box does not leave the page bottom-heavy.
  const blockH = fit.lines.length * fit.leading
  let ty = titleTop - (available - blockH) / 2 - display.heightAtSize(fit.size, { descender: false })

  for (const line of fit.lines) {
    page.drawText(line, { x: MARGIN, y: ty, size: fit.size, font: display, color: pal.text })
    ty -= fit.leading
  }
}

export async function buildEventPosterPdf(input: PosterInput): Promise<Uint8Array> {
  // The footer below is shared by both compositions, so it resolves the palette
  // itself rather than depending on whichever branch drew the page.
  const pal = resolvePosterPalette(input.palette)
  const doc = await PDFDocument.create()
  doc.setTitle(`${input.title} poster`)
  doc.setAuthor(input.organiserName)
  doc.setCreator('EventLinqs')
  doc.registerFontkit(fontkit)

  // The brand stack, embedded and subset. The same four files the social cards
  // draw with, so the printed poster and the posted story are one family.
  const faces = await loadCardFonts()
  const pick = (name: string, weight: number) =>
    faces.find(face => face.name === name && face.weight === weight) ?? faces[0]
  const fonts: Fonts = {
    display: await doc.embedFont(pick('Archivo', 800).data, { subset: true }),
    displayMid: await doc.embedFont(pick('Archivo', 700).data, { subset: true }),
    body: await doc.embedFont(pick('Hanken Grotesk', 500).data, { subset: true }),
    bodyStrong: await doc.embedFont(pick('Hanken Grotesk', 600).data, { subset: true }),
  }

  const page = doc.addPage([PAGE_W, PAGE_H])

  if (input.coverImage) {
    await drawCoverPoster(doc, page, { ...input, coverImage: input.coverImage }, fonts)
  } else {
    await drawTypographicPoster(doc, page, input, fonts)
  }

  // The footer: our mark, subordinate, one line. Shared by both compositions.
  if (input.showPlatformMark !== false) {
    const mark = 'Ticketing by EVENTLINQS'
    const markSize = 8.5
    const markW = fonts.displayMid.widthOfTextAtSize(mark, markSize)
    page.drawText(mark, {
      x: PAGE_W - MARGIN - markW - 3,
      y: 30,
      size: markSize,
      font: fonts.displayMid,
      color: pal.textFaint,
    })
    page.drawText('.', {
      x: PAGE_W - MARGIN - 3,
      y: 30,
      size: markSize,
      font: fonts.displayMid,
      color: pal.accentDeep,
    })
  }

  return doc.save()
}
