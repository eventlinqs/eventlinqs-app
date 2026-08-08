import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { buildEventPosterPdf, fitPosterTitle } from '@/lib/broadcast/poster'

/**
 * The two poster compositions.
 *
 * The founder's condition on splitting them was that the ARTWORK path renders
 * identically before and after. A hash alone would not prove that, because
 * pdf-lib stamps a creation timestamp, so this normalises the two date strings
 * and hashes the rest. The hash is written to disk and compared across a
 * checkout of the previous renderer by scripts/verify/poster-parity.mjs.
 *
 * The rendered PDFs are written out too, because a poster is a visual artefact
 * and a passing assertion about its bytes is not the same as somebody having
 * looked at it.
 */

const OUT = 'docs/design/poster-composition'

/** pdf-lib stamps the current time, so two identical renders differ by it. */
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
  it('renders both, writes them out, and records the parity hash', async () => {
    mkdirSync(OUT, { recursive: true })
    const qrPng = new Uint8Array(await QRCode.toBuffer(BASE.shortUrl, { margin: 1, width: 600 }))

    const withCover = await buildEventPosterPdf({
      ...BASE,
      qrPng,
      coverImage: { bytes: new Uint8Array(TINY_JPEG), format: 'jpg' },
    })
    const noCover = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })

    writeFileSync(`${OUT}/with-artwork.pdf`, Buffer.from(withCover))
    writeFileSync(`${OUT}/no-artwork.pdf`, Buffer.from(noCover))
    writeFileSync(
      `${OUT}/parity.json`,
      JSON.stringify(
        {
          note: 'CreationDate and ModDate are normalised before hashing; everything else is verbatim.',
          withArtwork: { sha256: sha(withCover), bytes: withCover.byteLength },
          noArtwork: { sha256: sha(noCover), bytes: noCover.byteLength },
        },
        null,
        2,
      ),
    )

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

  it('is deterministic: the same input renders the same bytes', async () => {
    const qrPng = new Uint8Array(await QRCode.toBuffer(BASE.shortUrl, { margin: 1, width: 600 }))
    const a = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })
    const b = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })
    expect(sha(a)).toBe(sha(b))
  })
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

  it('a long name steps down and wraps rather than overflowing', () => {
    const long = 'Warehouse party at the Barwon Club with Marlo Reyes back to back with Kita all night long'
    const fit = fitPosterTitle(long, metrics, {
      maxWidth: 499,
      maxHeight: 420,
      maxLines: 6,
      max: 68,
      min: 22,
    })
    expect(fit.size).toBeLessThan(50)
    expect(fit.lines.length).toBeLessThanOrEqual(6)
    // It must actually fit the box it was given.
    expect(fit.lines.length * fit.leading).toBeLessThanOrEqual(420)
    // Every line must fit the width.
    for (const line of fit.lines) {
      expect(metrics.widthOfTextAtSize(line, fit.size)).toBeLessThanOrEqual(499)
    }
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
