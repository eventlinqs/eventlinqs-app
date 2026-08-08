import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'

/**
 * The parity proof for the poster split.
 *
 * The founder's condition on splitting poster.ts into two compositions was that
 * the ARTWORK path renders identically before and after. Proving that means
 * rendering on this commit, checking out the pre-split renderer, rendering
 * again, and comparing the hashes.
 *
 * This file exists SEPARATELY from poster-composition.test.ts for one reason:
 * that file imports fitPosterTitle, which does not exist in the pre-split
 * renderer, so the module fails to link and the proof cannot run at all. This
 * one imports only buildEventPosterPdf, whose name and input shape are
 * identical either side of the split, so the same file renders against both.
 *
 * Driven by scripts/verify/poster-parity.mjs, which handles the checkout dance.
 */

const OUT = 'docs/design/poster-composition'

/**
 * The clock is frozen for the whole file, and that is load-bearing.
 *
 * pdf-lib stamps /CreationDate and /ModDate with the current time, and it
 * writes document metadata into a COMPRESSED object stream, so those dates are
 * not plaintext in the output. An earlier version of this proof tried to
 * normalise them with a regex over the raw bytes; the regex matched nothing,
 * every render produced a different hash, and the proof would have reported a
 * moved artwork path even against a byte-for-byte identical renderer.
 *
 * Freezing the clock removes the variance at its source instead of trying to
 * paper over it afterwards, which means the hash below is a plain SHA-256 of
 * the raw bytes with NOTHING normalised away. That is a stronger proof, not a
 * weaker one: if any byte of the artwork composition moves, this fails.
 */
beforeAll(() => {
  // Only Date is faked. Faking setTimeout as well would stall the async work
  // inside pdf-lib and the QR encoder, which both await real ticks.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
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

/**
 * The fixture is deliberately ordinary: no token in it is wider than a line, so
 * the hash is not sensitive to the word-breaking behaviour and measures the
 * composition alone.
 */
const BASE = {
  title: 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita',
  dateLabel: 'Saturday 20 September 2026',
  locality: 'The Barwon Club, Geelong',
  priceLabel: 'From $25',
  shortUrl: 'https://eventlinqs.com/launch/k/abcdefghjkmn',
  organiserName: 'Barwon Club Presents',
}

describe('poster parity', () => {
  it('renders both compositions and records the hashes', async () => {
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
          note: 'Raw SHA-256 of the whole file. The clock is frozen, so nothing is normalised away.',
          withArtwork: { sha256: sha(withCover), bytes: withCover.byteLength },
          noArtwork: { sha256: sha(noCover), bytes: noCover.byteLength },
        },
        null,
        2,
      ),
    )

    expect(Buffer.from(withCover.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(Buffer.from(noCover.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('renders byte-identically across repeated renders, so the hash means something', async () => {
    const qrPng = new Uint8Array(await QRCode.toBuffer(BASE.shortUrl, { margin: 1, width: 600 }))
    const a = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })
    const b = await buildEventPosterPdf({ ...BASE, qrPng, coverImage: null })
    expect(sha(a)).toBe(sha(b))
  })
})
