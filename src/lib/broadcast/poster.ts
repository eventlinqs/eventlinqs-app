import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { loadCardFonts } from '@/lib/broadcast/card-fonts'

/**
 * THE A4 QR POSTER.
 *
 * One print-ready A4 poster per event: the organiser's cover photograph, their
 * own mark, the title, date, locality and price, and a large tracked QR, so a
 * poster on a community noticeboard is a measured acquisition channel like any
 * other. An event with no embeddable photograph gets a typographic composition
 * on the brand navy, never a broken poster and never a substitute picture.
 *
 * TWO THINGS CHANGED HERE AND BOTH WERE DEFECTS.
 *
 * 1. It carried the EventLinqs wordmark and no organiser logo. A promoter's
 *    poster is the one artefact that goes on a wall with their name on it, and
 *    ours was the only name on it. The organiser mark now leads the
 *    information band at full strength and ours is one small footer line.
 * 2. It was set in Helvetica, the PDF standard font, not the brand stack. A
 *    designer reads that instantly as a default. It is now set in Archivo and
 *    Hanken Grotesk, the same faces as the social cards, embedded and subset
 *    so the file stays small and prints correctly anywhere.
 */

const PDF_NAVY = rgb(0.039, 0.086, 0.157) // ink-900 #0A1628
const PDF_NAVY_DEEP = rgb(0.02, 0.051, 0.094)
const PDF_GOLD = rgb(0.909, 0.718, 0.22) // gold-400 #E8B738
const PDF_GOLD_DEEP = rgb(0.831, 0.627, 0.09) // #D4A017
const PDF_WHITE = rgb(1, 1, 1)
const PDF_WHITE_MUTED = rgb(0.85, 0.87, 0.9)
const PDF_WHITE_FAINT = rgb(0.62, 0.66, 0.72)

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48

export type PosterImage = { bytes: Uint8Array; format: 'jpg' | 'png' }

export interface PosterInput {
  title: string
  dateLabel: string
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

export async function buildEventPosterPdf(input: PosterInput): Promise<Uint8Array> {
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
  const display = await doc.embedFont(pick('Archivo', 800).data, { subset: true })
  const displayMid = await doc.embedFont(pick('Archivo', 700).data, { subset: true })
  const body = await doc.embedFont(pick('Hanken Grotesk', 500).data, { subset: true })
  const bodyStrong = await doc.embedFont(pick('Hanken Grotesk', 600).data, { subset: true })

  const page = doc.addPage([PAGE_W, PAGE_H])

  const bandH = PAGE_H * 0.45
  const imageRegionH = PAGE_H - bandH

  // Canvas: full-page navy so any gap reads as brand, never as white.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PDF_NAVY })

  const logo = input.organiserLogo ? await embed(doc, input.organiserLogo) : null
  const onTile = input.logoPlacement !== 'on-navy'

  if (input.coverImage) {
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
  } else {
    // No photograph: a typographic field, the same answer the social cards
    // give, so the two artefacts still look like one set.
    page.drawRectangle({
      x: 0,
      y: bandH,
      width: PAGE_W,
      height: imageRegionH,
      color: PDF_NAVY_DEEP,
    })
    let y = PAGE_H - 120
    if (logo) {
      const h = Math.min(78, (logo.height / logo.width) * 200)
      const w = (logo.width / logo.height) * h
      if (onTile) {
        page.drawRectangle({
          x: MARGIN - 10,
          y: y - h - 10,
          width: w + 20,
          height: h + 20,
          color: PDF_WHITE,
        })
      }
      page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h })
      y -= h + 34
    }
    const nameWidth = drawTracked(page, input.organiserName.toUpperCase(), {
      x: MARGIN,
      y,
      size: 15,
      font: displayMid,
      color: PDF_WHITE,
      tracking: 1.6,
    })
    page.drawRectangle({ x: MARGIN, y: y - 16, width: Math.min(nameWidth, 200), height: 3, color: PDF_GOLD })
  }

  // The information band, drawn OVER the photograph so a cover-fit overflow is
  // cleanly cropped by its edge.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: bandH, color: PDF_NAVY })
  page.drawRectangle({ x: 0, y: bandH - 3, width: PAGE_W, height: 3, color: PDF_GOLD })

  const qrSize = 140
  const qrX = PAGE_W - MARGIN - qrSize
  const textMaxW = qrX - MARGIN - 24

  let y = bandH - 44

  // The organiser identity leads the band. Their mark, their name.
  if (input.coverImage && logo) {
    const h = Math.min(34, (logo.height / logo.width) * 120)
    const w = (logo.width / logo.height) * h
    if (onTile) {
      page.drawRectangle({
        x: MARGIN - 6,
        y: y - h - 6,
        width: w + 12,
        height: h + 12,
        color: PDF_WHITE,
      })
    }
    page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h })
    drawTracked(page, input.organiserName.toUpperCase(), {
      x: MARGIN + w + 16,
      y: y - h / 2 - 3,
      size: 10,
      font: displayMid,
      color: PDF_WHITE_MUTED,
      tracking: 1.2,
    })
    y -= h + 22
  } else if (input.coverImage) {
    drawTracked(page, input.organiserName.toUpperCase(), {
      x: MARGIN,
      y,
      size: 11,
      font: displayMid,
      color: PDF_WHITE_MUTED,
      tracking: 1.4,
    })
    y -= 26
  } else {
    y -= 4
  }

  // Title, wrapped, at most three lines.
  const titleSize = 29
  const titleLines = wrapText(input.title, display, titleSize, textMaxW).slice(0, 3)
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: titleSize, font: display, color: PDF_WHITE })
    y -= titleSize + 5
  }

  y -= 10
  page.drawText(input.dateLabel, { x: MARGIN, y, size: 14, font: bodyStrong, color: PDF_GOLD })
  y -= 22
  if (input.locality) {
    for (const line of wrapText(input.locality, body, 12.5, textMaxW).slice(0, 2)) {
      page.drawText(line, { x: MARGIN, y, size: 12.5, font: body, color: PDF_WHITE_MUTED })
      y -= 18
    }
  }

  // The gold ticket bar: price and the tracked link, one call to action, the
  // same device the social cards use.
  const barText = `${input.priceLabel}  ·  ${input.shortUrl.replace(/^https?:\/\//, '')}`
  const barSize = 12
  const barW = Math.min(bodyStrong.widthOfTextAtSize(barText, barSize) + 40, textMaxW)
  const barH = 30
  y -= 14
  page.drawRectangle({
    x: MARGIN,
    y: y - barH + 8,
    width: barW,
    height: barH,
    color: PDF_GOLD,
  })
  page.drawText(barText, {
    x: MARGIN + 20,
    y: y - barH + 19,
    size: barSize,
    font: bodyStrong,
    color: PDF_NAVY,
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
    color: PDF_GOLD,
  })

  // The footer: our mark, subordinate, one line.
  if (input.showPlatformMark !== false) {
    const mark = 'Ticketing by EVENTLINQS'
    const markSize = 8.5
    const markW = displayMid.widthOfTextAtSize(mark, markSize)
    page.drawText(mark, {
      x: PAGE_W - MARGIN - markW - 3,
      y: 30,
      size: markSize,
      font: displayMid,
      color: PDF_WHITE_FAINT,
    })
    page.drawText('.', {
      x: PAGE_W - MARGIN - 3,
      y: 30,
      size: markSize,
      font: displayMid,
      color: PDF_GOLD_DEEP,
    })
  }

  return doc.save()
}
