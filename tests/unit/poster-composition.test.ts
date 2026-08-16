import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { buildEventPosterPdf, fitPosterTitle } from '@/lib/broadcast/poster'

/**
 * The two poster compositions, and the title fitter underneath them.
 *
 * The byte-level parity proof against the pre-split renderer lives in
 * poster-parity.test.ts and scripts/verify/poster-parity.mjs, not here. This
 * file is about behaviour: that both compositions render, that they are
 * genuinely different documents, and that the fitter returns the largest size
 * that fits its box.
 */

/**
 * Two renders on a live clock differ by the timestamp pdf-lib stamps into a
 * compressed object stream, so this is only ever used to compare two documents
 * rendered in the same second, never to assert stability over time.
 */
function normalise(bytes: Uint8Array): Buffer {
  const buf = Buffer.from(bytes)
  return Buffer.from(
    buf
      .toString('latin1')
      .replace(/\/CreationDate \(D:[^)]*\)/g, '/CreationDate (D:FIXED)')
      .replace(/\/ModDate \(D:[^)]*\)/g, '/ModDate (D:FIXED)'),
    'latin1',
  )
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(normalise(bytes)).digest('hex')
}

/** A real 3x2 JPEG, so the cover path embeds an actual image. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAMBAREA/8QAHwAAAQUBAQEB' +
    'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh' +
    'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
    'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
    'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+v//Z',
  'base64',
)

const BASE = {
  title: 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita',
  dateLabel: 'Saturday 20 September 2026',
  locality: 'The Barwon Club, Geelong',
  priceLabel: 'From $25',
  shortUrl: 'https://eventlinqs.com/launch/k/abcdefghjkmn',
  organiserName: 'Barwon Club Presents',
}

describe('the two poster compositions', () => {
  it('both render a real PDF', async () => {
    const qrPng = new Uint8Array(await QRCode.toBuffer(BASE.shortUrl, { margin: 1, width: 600 }))

    const withCover = await buildEventPosterPdf({
      ...BASE,
      qrPng,
      coverImage: { bytes: new Uint8Array(TINY_JPEG), format: 'jpg' },
    })
    const noCover = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })

    expect(withCover.byteLength).toBeGreaterThan(1000)
    expect(noCover.byteLength).toBeGreaterThan(1000)
    expect(Buffer.from(withCover.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(Buffer.from(noCover.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('the two compositions are genuinely different documents', async () => {
    const qrPng = new Uint8Array(await QRCode.toBuffer(BASE.shortUrl, { margin: 1, width: 600 }))
    const withCover = await buildEventPosterPdf({
      ...BASE,
      qrPng,
      coverImage: { bytes: new Uint8Array(TINY_JPEG), format: 'jpg' },
    })
    const noCover = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })
    expect(sha(withCover)).not.toBe(sha(noCover))
  })

  // Determinism, the parity hash and the written-out PDFs all live in
  // poster-parity.test.ts, which freezes the clock. They cannot live here:
  // pdf-lib stamps the current time into a compressed object stream, so on a
  // live clock two renders differ whenever they straddle a second boundary,
  // which made the determinism assertion here flaky rather than meaningful.
})

describe('the typographic title fills the page it is given', () => {
  const metrics = {
    // Archivo-like average advance. The real font is used in the renderer; this
    // stands in so the fitter itself is tested rather than the font loader.
    widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.55,
  }

  it('a short name prints LARGE rather than lost in a fixed size', () => {
    const fit = fitPosterTitle("Ruby's 16th", metrics, {
      maxWidth: 499,
      maxHeight: 420,
      maxLines: 6,
      max: 68,
      min: 22,
    })
    // The old renderer drew every title at 29pt. A three-word title must now be
    // far bigger than that, which is the entire point of the composition.
    expect(fit.size).toBeGreaterThan(50)
    expect(fit.lines.length).toBeLessThanOrEqual(2)
  })

  /**
   * A word-greedy wrap, written out here rather than imported, so the
   * maximality assertion below is independent of the implementation it is
   * checking. Safe for these cases because none of them contains a token wider
   * than the line; character breaking is covered by its own test.
   */
  function wrapAt(text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = []
    let current = ''
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word
      if (metrics.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
      } else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
    return lines
  }

  function fitsAt(text: string, size: number, box: { maxWidth: number; maxHeight: number; maxLines: number }) {
    const lines = wrapAt(text, size, box.maxWidth)
    return lines.length <= box.maxLines && lines.length * size * 1.08 <= box.maxHeight
  }

  it('a long name steps down and wraps rather than overflowing', () => {
    const long = 'Warehouse party at the Barwon Club with Marlo Reyes back to back with Kita all night long'
    const box = { maxWidth: 499, maxHeight: 420, maxLines: 6 }
    const fit = fitPosterTitle(long, metrics, { ...box, max: 68, min: 22 })

    // It stepped down from the ceiling rather than overflowing at full size.
    expect(fit.size).toBeLessThan(68)
    expect(fit.lines.length).toBeLessThanOrEqual(6)
    // It must actually fit the box it was given.
    expect(fit.lines.length * fit.leading).toBeLessThanOrEqual(420)
    // Every line must fit the width.
    for (const line of fit.lines) {
      expect(metrics.widthOfTextAtSize(line, fit.size)).toBeLessThanOrEqual(499)
    }
    // The fitter's actual contract: the LARGEST size that fits. Asserting a
    // particular point size instead would encode a guess about the font metric
    // rather than the fitter's behaviour, which is the very thing the stand-in
    // metric above exists to avoid. One point larger must not fit.
    expect(fitsAt(long, fit.size, box)).toBe(true)
    expect(fitsAt(long, fit.size + 1, box)).toBe(false)
  })

  it('a pathological title clamps instead of running off the page', () => {
    const fit = fitPosterTitle('x'.repeat(4000), metrics, {
      maxWidth: 499,
      maxHeight: 420,
      maxLines: 6,
      max: 68,
      min: 22,
    })
    expect(fit.size).toBe(22)
    expect(fit.lines.length).toBeLessThanOrEqual(6)
  })

  it('breaks a token wider than the line instead of running it off the page', () => {
    // A pasted URL is the realistic version of this: one token, no spaces, and
    // wider than the column at any size the fitter will consider.
    const url = 'https://eventlinqs.com/launch/k/abcdefghjkmn?utm_source=instagram&utm_campaign=launch'
    const fit = fitPosterTitle(url, metrics, {
      maxWidth: 499,
      maxHeight: 420,
      maxLines: 6,
      max: 68,
      min: 22,
    })
    expect(fit.lines.length).toBeGreaterThan(1)
    for (const line of fit.lines) {
      expect(metrics.widthOfTextAtSize(line, fit.size)).toBeLessThanOrEqual(499)
    }
  })

  it('never returns a size below the floor', () => {
    for (const title of ['A', 'Two words', 'x'.repeat(500)]) {
      const fit = fitPosterTitle(title, metrics, {
        maxWidth: 499,
        maxHeight: 420,
        maxLines: 6,
        max: 68,
        min: 22,
      })
      expect(fit.size).toBeGreaterThanOrEqual(22)
    }
  })
})
