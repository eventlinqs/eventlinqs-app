import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import QRCode from 'qrcode'
import { PDFDocument } from 'pdf-lib'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'

/**
 * THE HEADLINE MUST CLEAR THE QR BLOCK.
 *
 * WHY THIS EXISTS. On the typographic poster the headline is set across the
 * FULL content width, while the date and locality sit only in the left column
 * beside the QR. The floor of the headline box was measured from that left
 * column alone (`detailY + 8`), so it was about twenty five points BELOW the top
 * of the QR's white tile. A six line title already sat flush against the code
 * and a longer one would have printed its last line straight through it: a
 * poster on a wall with an unscannable QR, which is the one thing on the page
 * that has to work.
 *
 * The assertion reads the REAL drawing operators out of the rendered PDF rather
 * than re-deriving the layout, because re-deriving it is how the bug got in: the
 * measurement and the drawing disagreed and nothing compared them. Decompress
 * the page content stream, find the QR tile rectangle and the lowest headline
 * baseline, and check the gap.
 */

const LONG_TITLE =
  'The Barwon Club presents a very long winter warehouse session with Marlo Reyes back to back with Kita and friends across two rooms until sunrise'

type Rect = { x: number; y: number; w: number; h: number }

/**
 * Every inflatable stream in the file, concatenated.
 *
 * Deliberately reads the BYTES rather than walking pdf-lib's object model: the
 * page contents can be a single stream or an array of them depending on how the
 * document was assembled, and the classes expose their payload under different
 * names across versions. Scanning for stream bodies and inflating whatever
 * inflates is version-proof, and the operators are what this test is after.
 */
function inflateAllStreams(pdf: Uint8Array): string {
  const bytes = Buffer.from(pdf)
  const haystack = bytes.toString('latin1')
  let out = ''
  let at = 0
  for (;;) {
    const open = haystack.indexOf('stream', at)
    if (open === -1) break
    let start = open + 'stream'.length
    if (haystack[start] === '\r') start += 1
    if (haystack[start] === '\n') start += 1
    const end = haystack.indexOf('endstream', start)
    if (end === -1) break
    try {
      out += inflateSync(bytes.subarray(start, end)).toString('latin1')
    } catch {
      /* not a deflate stream: a font file or an image. Skip it. */
    }
    at = end + 'endstream'.length
  }
  return out
}

async function pageOperators(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf)
  const page = doc.getPage(0)
  expect(page.getWidth()).toBeCloseTo(595.28, 1)
  const text = inflateAllStreams(pdf)

  // pdf-lib emits no `re` operator at all. A rectangle is a translate
  // (`1 0 0 1 tx ty cm`) followed by an explicit path drawn at the origin
  // (`0 0 m / 0 h l / w h l / w 0 l / h / f`), so the position comes off the
  // transform and the size off the path. Text is positioned by `Tm`.
  const rects: Rect[] = [
    ...text.matchAll(
      /1 0 0 1 ([\d.-]+) ([\d.-]+) cm[\s\S]{0,160}?0 0 m\s+0 ([\d.-]+) l\s+([\d.-]+) [\d.-]+ l/g,
    ),
  ].map(m => ({ x: Number(m[1]), y: Number(m[2]), h: Number(m[3]), w: Number(m[4]) }))

  const baselines = [...text.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)].map(m => Number(m[2]))
  return { rects, baselines }
}

describe('the typographic poster headline clears the QR block', () => {
  it('leaves real air above the QR even with a title at the six line ceiling', async () => {
    const qrPng = new Uint8Array(
      await QRCode.toBuffer('https://www.eventlinqs.com.au/launch/k/abcdefghjkmn', {
        margin: 1,
        width: 600,
      }),
    )
    const pdf = await buildEventPosterPdf({
      title: LONG_TITLE,
      dateLabel: 'Saturday 20 September 2026',
      locality: 'The Barwon Club, 509 Moorabool Street, South Geelong',
      priceLabel: 'From $25',
      shortUrl: 'https://www.eventlinqs.com.au/launch/k/abcdefghjkmn',
      qrPng,
      organiserName: 'Barwon Club Presents',
      coverImage: null,
    })

    const { rects, baselines } = await pageOperators(pdf)

    // The QR white tile: a square in the right half of the page, 152pt across
    // (the 132pt code plus its 10pt surround).
    const qrTile = rects
      .filter(r => r.x > 300 && Math.abs(r.w - r.h) < 3 && r.w > 100)
      .sort((a, b) => b.y + b.h - (a.y + a.h))[0]
    expect(qrTile, 'the QR white tile should be on the page').toBeDefined()

    const qrTop = qrTile!.y + qrTile!.h
    // Everything drawn above the details block is headline. The lowest of those
    // baselines is the one that used to collide.
    const headlineBaselines = baselines.filter(y => y > qrTop - 60)
    const lowest = Math.min(...headlineBaselines)

    // Real clearance, not the rounding left over from measuring the wrong thing.
    // Before the fix this was about minus twenty five: the box floor sat BELOW
    // the top of the tile.
    expect(lowest).toBeGreaterThan(qrTop)
    expect(lowest - qrTop).toBeGreaterThanOrEqual(20)
  }, 20_000)
})
