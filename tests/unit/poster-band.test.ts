import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'

/**
 * The six arrivals, rendered WITH artwork, so the information band change can
 * be looked at rather than argued about.
 *
 * The founder ruled on 9 August 2026 that the band must size itself to its
 * content instead of sitting at a flat 45% of the page. This renders every
 * arrival the live walk uses, plus a NO-ARTWORK control that must not move at
 * all, and records a hash of each so before and after can be compared across a
 * checkout by scripts/verify/poster-band-before-after.mjs.
 *
 * Clock frozen, so the hash is a raw SHA-256 of the whole file with nothing
 * normalised away.
 */

const OUT = 'docs/design/poster-band'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

const PHOTO = 'public/images/hero/afrobeats.jpg'

/** The same six arrivals the live walk drives, as poster inputs. */
const ARRIVALS = [
  {
    slug: 'dj',
    title: 'Warehouse party at the Barwon Club',
    dateLabel: 'Saturday 20 September 2026',
    locality: 'The Barwon Club, Geelong',
    priceLabel: 'From $25',
    organiserName: 'Barwon Club Presents',
  },
  {
    slug: 'comedian',
    title: 'Comedy night at the Prince',
    dateLabel: 'Tuesday 1 September 2026',
    locality: 'The Prince, Geelong',
    priceLabel: 'From $15',
    organiserName: 'Prince Comedy',
  },
  {
    slug: 'market',
    title: 'Geelong makers market',
    dateLabel: 'Sunday 20 September 2026',
    locality: 'Johnstone Park, Geelong',
    priceLabel: 'Free entry',
    organiserName: 'Geelong Makers',
  },
  {
    slug: 'workshop',
    title: 'Pottery workshop',
    dateLabel: 'Saturday 27 September 2026',
    locality: 'Newtown, Geelong',
    priceLabel: 'From $85',
    organiserName: 'The Studio Newtown',
  },
  {
    slug: 'charity',
    title: 'Trivia night for Geelong Animal Rescue',
    dateLabel: 'Saturday 12 September 2026',
    locality: 'Geelong RSL',
    priceLabel: 'From $30',
    organiserName: 'Geelong Animal Rescue',
  },
  {
    slug: 'birthday',
    title: "Ruby's 16th",
    dateLabel: 'Saturday 20 September 2026',
    locality: 'Belmont, Geelong',
    priceLabel: 'Free entry',
    organiserName: 'The Nguyen Family',
  },
]

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

describe('the information band, with artwork', () => {
  it('renders all six arrivals with a photograph, and a no-artwork control', async () => {
    mkdirSync(OUT, { recursive: true })
    const shortUrl = 'https://eventlinqs.com/launch/k/abcdefghjkmn'
    const qrPng = new Uint8Array(await QRCode.toBuffer(shortUrl, { margin: 1, width: 600 }))
    const cover = { bytes: new Uint8Array(readFileSync(PHOTO)), format: 'jpg' as const }

    const hashes: Record<string, string> = {}

    for (const a of ARRIVALS) {
      const pdf = await buildEventPosterPdf({ ...a, shortUrl, qrPng, coverImage: cover })
      writeFileSync(`${OUT}/${a.slug}-artwork.pdf`, Buffer.from(pdf))
      hashes[`${a.slug}-artwork`] = sha(pdf)
      expect(Buffer.from(pdf.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    }

    // THE CONTROL. The typographic composition must not move by a single byte
    // as a result of the band change, and this is what proves it.
    for (const a of ARRIVALS) {
      const pdf = await buildEventPosterPdf({ ...a, shortUrl, qrPng, coverImage: null })
      writeFileSync(`${OUT}/${a.slug}-no-artwork.pdf`, Buffer.from(pdf))
      hashes[`${a.slug}-no-artwork`] = sha(pdf)
    }

    writeFileSync(`${OUT}/hashes.json`, `${JSON.stringify(hashes, null, 2)}\n`)
    expect(Object.keys(hashes)).toHaveLength(ARRIVALS.length * 2)
  }, 60_000)
})
