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

  const qrSize = 140
  const qrX = PAGE_W - MARGIN - qrSize
  const textMaxW = qrX - MARGIN - 24

  // Title metrics are needed BEFORE the mark is placed: pdf-lib draws text from
  // its baseline, so the gap under the mark has to clear the title's ascender,
  // not the baseline.
  const titleSize = 29
  const titleAscent = display.heightAtSize(titleSize, { descender: false })
  const titleLines = wrapText(input.title, display, titleSize, textMaxW).slice(0, 3)
  const localityLines = input.locality
    ? wrapText(input.locality, body, 12.5, textMaxW).slice(0, 2)
    : []
  const barH = 30

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
  let measured = 44
  if (logo) {
    const lh = Math.min(34, (logo.height / logo.width) * 120)
    measured += lh + (onTile ? 6 : 0) + 22 + titleAscent
  } else {
    measured += 26
  }
  measured += titleLines.length * (titleSize + 5)
  measured += 10 + 22
  measured += localityLines.length * 18
  measured += 14
  measured += barH - 8 // the ticket bar's lowest drawn edge

  // The QR column is fixed height and often the taller of the two, so it sets
  // the floor: 60 below the band top, 140 tall, its label 26 under that, plus
  // air for the descender.
  const qrColumnH = 60 + qrSize + 26 + 6

  // Clear of the shared platform footer, which both compositions draw at an
  // absolute y of 30.
  const BAND_BOTTOM_PAD = 46
  // Never TALLER than it used to be, so the photograph can only ever gain space
  // by this change and never lose it. A title long enough to need more than
  // this already overflowed before; that is untouched here.
  const BAND_MAX = PAGE_H * 0.45

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
    const lh = Math.min(34, (logo.height / logo.width) * 120)
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
    y -= 26
  }

  // Title, wrapped, at most three lines. Measured above, drawn here.
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: titleSize, font: display, color: pal.text })
    y -= titleSize + 5
  }

  y -= 10
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
    bodyStrong.widthOfTextAtSize(barFit.text, barFit.fontSize) + barPad * 2,
    textMaxW,
  )
  y -= 14
  page.drawRectangle({
    x: MARGIN,
    y: y - barH + 8,
    width: barW,
    height: barH,
    color: pal.accent,
  })
  page.drawText(barFit.text, {
    x: MARGIN + barPad,
    y: y - barH + 19,
    size: barFit.fontSize,
    font: bodyStrong,
    color: pal.onAccent,
  })

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
    bodyStrong.widthOfTextAtSize(barFit.text, barFit.fontSize) + barPad * 2,
    detailMaxW,
  )
  const barH = 32
  const barY = qrY + 2
  page.drawRectangle({ x: MARGIN, y: barY, width: barW, height: barH, color: pal.accent })
  page.drawText(barFit.text, {
    x: MARGIN + barPad,
    y: barY + 11,
    size: barFit.fontSize,
    font: bodyStrong,
    color: pal.onAccent,
  })

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
  const titleBottom = detailY + 8
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
