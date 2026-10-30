import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import { loadCardFonts } from '@/lib/broadcast/card-fonts'

/**
 * A PARTNER VENUE'S PRINTABLE SHEET (the project manager's 17:25 of 30 October 2026, D3): one A5 page for a bar or a door,
 * the venue's name, a line saying what the code opens, its own tracked QR and the host for anyone who would rather type.
 * Rendered, never generated (Law 6). It promises nothing about tickets or numbers. The brand stack, as the poster.
 */

/** A5 in PDF points, 148 x 210 mm. */
const PAGE_W = 419.53
const PAGE_H = 595.28
const MARGIN = 36
const QR_SIZE = 260
const NAVY = rgb(10 / 255, 22 / 255, 40 / 255)
const NAME_MAX = 34
const NAME_MIN = 14
const NAME_MAX_LINES = 3

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) line = next
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** The largest size at which the name fits its lines and every word fits the page. */
function fitName(name: string, font: PDFFont, width: number): { size: number; lines: string[] } {
  for (let size = NAME_MAX; size > NAME_MIN; size -= 1) {
    const lines = wrap(name, font, size, width)
    if (lines.length <= NAME_MAX_LINES && lines.every((l) => font.widthOfTextAtSize(l, size) <= width)) return { size, lines }
  }
  // The smallest size: a name too long for even this keeps its first lines, ended plainly.
  const all = wrap(name, font, NAME_MIN, width)
  const lines = all.slice(0, NAME_MAX_LINES)
  if (all.length > NAME_MAX_LINES) lines[NAME_MAX_LINES - 1] = `${lines[NAME_MAX_LINES - 1].replace(/[,.;:]?$/, '')}...`
  return { size: NAME_MIN, lines }
}

export async function buildVenueQrSheet(input: { venueName: string; url: string; host: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${input.venueName} QR sheet`)
  doc.setCreator('EventLinqs')
  doc.registerFontkit(fontkit)
  const faces = await loadCardFonts()
  const pick = (name: string, weight: number) => faces.find((f) => f.name === name && f.weight === weight) ?? faces[0]
  const display = await doc.embedFont(pick('Archivo', 800).data, { subset: true })
  const body = await doc.embedFont(pick('Hanken Grotesk', 500).data, { subset: true })

  const page = doc.addPage([PAGE_W, PAGE_H])
  const width = PAGE_W - MARGIN * 2
  const centred = (text: string, font: PDFFont, size: number, y: number) =>
    page.drawText(text, { x: (PAGE_W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: NAVY })

  const name = fitName(input.venueName, display, width)
  let y = PAGE_H - MARGIN - name.size
  for (const line of name.lines) {
    centred(line, display, name.size, y)
    y -= name.size * 1.15
  }
  centred("See what's on here", body, 16, y - 6)

  const qr = await QRCode.toBuffer(input.url, { errorCorrectionLevel: 'M', margin: 0, width: 1040, color: { dark: '#0A1628', light: '#FFFFFF' } })
  const image = await doc.embedPng(qr)
  const qrY = (PAGE_H - QR_SIZE) / 2 - 36
  page.drawImage(image, { x: (PAGE_W - QR_SIZE) / 2, y: qrY, width: QR_SIZE, height: QR_SIZE })

  centred('Scan with your phone camera', body, 13, qrY - 26)
  centred(input.host, display, 15, MARGIN)
  return doc.save()
}
