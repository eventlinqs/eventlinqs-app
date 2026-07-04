import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Broadcast Layer Stage 1: the A4 QR poster kit (SPEC section 2.4).
 *
 * One print-ready A4 poster per event: cover image treated with the brand
 * navy band, title, date, locality, price, and a large tracked QR code
 * (channel 'qr'), so a poster on a community noticeboard is a measured
 * acquisition channel like any other. Events with no embeddable image get
 * the branded navy and gold treatment: never a broken poster.
 *
 * Brand constants mirror src/lib/reporting/exporters.ts (the door list PDF)
 * so every EventLinqs PDF speaks one visual language.
 */

const PDF_NAVY = rgb(0.039, 0.086, 0.157) // ink-900 #0A1628
const PDF_GOLD = rgb(0.831, 0.627, 0.09) // gold #D4A017
const PDF_WHITE = rgb(1, 1, 1)
const PDF_WHITE_MUTED = rgb(0.85, 0.87, 0.9)

const PAGE_W = 595.28
const PAGE_H = 841.89

export interface PosterInput {
  title: string
  dateLabel: string
  locality: string
  priceLabel: string
  shortUrl: string
  /** PNG bytes of the tracked QR code. */
  qrPng: Uint8Array
  /** JPEG or PNG bytes of the cover image, when available and embeddable. */
  coverImage?: { bytes: Uint8Array; format: 'jpg' | 'png' } | null
}

/** Wrap a line to a width using the font's real metrics. */
function wrapText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export async function buildEventPosterPdf(input: PosterInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${input.title} poster`)
  doc.setCreator('EventLinqs')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const page = doc.addPage([PAGE_W, PAGE_H])

  // The info band owns the lower 45 percent; the image (or branded field)
  // owns the top. The band is drawn OVER the image so a cover-fit overflow
  // is cleanly cropped by the band edge.
  const bandH = PAGE_H * 0.45
  const imageRegionH = PAGE_H - bandH

  // Canvas: full-page navy so any gap reads as brand, never as white.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PDF_NAVY })

  if (input.coverImage) {
    const embedded =
      input.coverImage.format === 'png'
        ? await doc.embedPng(input.coverImage.bytes)
        : await doc.embedJpg(input.coverImage.bytes)
    // Cover-fit into the top region, centred, overflow hidden by the band.
    const scale = Math.max(PAGE_W / embedded.width, imageRegionH / embedded.height)
    const w = embedded.width * scale
    const h = embedded.height * scale
    page.drawImage(embedded, {
      x: (PAGE_W - w) / 2,
      y: PAGE_H - h + (h - imageRegionH) / 2,
      width: w,
      height: h,
    })
  } else {
    // Branded fallback field: gold rule under the wordmark, generous space.
    page.drawText('EVENTLINQS', {
      x: 48,
      y: PAGE_H - 120,
      size: 40,
      font: bold,
      color: PDF_WHITE,
    })
    page.drawRectangle({ x: 48, y: PAGE_H - 138, width: 120, height: 4, color: PDF_GOLD })
  }

  // The info band.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: bandH, color: PDF_NAVY })
  page.drawRectangle({ x: 0, y: bandH - 3, width: PAGE_W, height: 3, color: PDF_GOLD })

  const MARGIN = 48
  const qrSize = 150
  const qrX = PAGE_W - MARGIN - qrSize
  const textMaxW = qrX - MARGIN - 24

  let y = bandH - 54

  // Title, wrapped, max three lines.
  const titleSize = 30
  const titleLines = wrapText(input.title, bold, titleSize, textMaxW).slice(0, 3)
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: titleSize, font: bold, color: PDF_WHITE })
    y -= titleSize + 6
  }

  y -= 8
  page.drawText(input.dateLabel, { x: MARGIN, y, size: 15, font, color: PDF_GOLD })
  y -= 24
  if (input.locality) {
    for (const line of wrapText(input.locality, font, 13, textMaxW).slice(0, 2)) {
      page.drawText(line, { x: MARGIN, y, size: 13, font, color: PDF_WHITE_MUTED })
      y -= 19
    }
  }
  y -= 8
  page.drawText(input.priceLabel, { x: MARGIN, y, size: 17, font: bold, color: PDF_WHITE })

  // The tracked QR block.
  const qrImage = await doc.embedPng(input.qrPng)
  const qrY = bandH - 74 - qrSize
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
    x: qrX + (qrSize - bold.widthOfTextAtSize(scanLabel, 12)) / 2,
    y: qrY - 30,
    size: 12,
    font: bold,
    color: PDF_GOLD,
  })

  // Footer: the short URL (the human fallback for the QR) and the mark.
  page.drawText(input.shortUrl.replace(/^https?:\/\//, ''), {
    x: MARGIN,
    y: 34,
    size: 12,
    font,
    color: PDF_WHITE_MUTED,
  })
  const mark = 'EVENTLINQS.'
  page.drawText(mark, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(mark, 12),
    y: 34,
    size: 12,
    font: bold,
    color: PDF_GOLD,
  })

  return doc.save()
}
