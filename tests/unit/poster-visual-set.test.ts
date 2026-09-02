import { readFileSync } from 'node:fs'
import { writeProofArtefact } from '../helpers/proof-artefact'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'
import { POSTER_SET } from '../../scripts/verify/poster-visual-set.mjs'

/**
 * Renders the visual proof set to docs/design/poster-composition/set/ so a
 * human can open them and judge whether they read as designed posters. The
 * assertions here are only a floor (every file is a real PDF); the point of the
 * file is the artefacts it writes, not the expectations it checks.
 *
 * The case list and the reason for each case live in
 * scripts/verify/poster-visual-set.mjs.
 */

const OUT = 'docs/design/poster-composition/set'

/**
 * The clock is frozen so the committed PDFs are byte-stable. Without it every
 * run rewrites six binaries with a new timestamp and they show up as modified
 * in git forever, which trains everybody to ignore a real change to them.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

type Case = {
  slug: string
  note: string
  photo?: string
  input: {
    title: string
    dateLabel: string
    locality: string
    priceLabel: string
    organiserName: string
  }
}

describe('the poster visual proof set', () => {
  it('renders every case to a real PDF', async () => {
    const shortUrl = 'https://eventlinqs.com/launch/k/abcdefghjkmn'
    const qrPng = new Uint8Array(await QRCode.toBuffer(shortUrl, { margin: 1, width: 600 }))
    const index: string[] = []

    for (const entry of POSTER_SET as Case[]) {
      const coverImage = entry.photo
        ? { bytes: new Uint8Array(readFileSync(entry.photo)), format: 'jpg' as const }
        : null

      const pdf = await buildEventPosterPdf({ ...entry.input, shortUrl, qrPng, coverImage })
      writeProofArtefact(`${OUT}/${entry.slug}.pdf`, Buffer.from(pdf))
      index.push(`${entry.slug}.pdf  ${entry.note}`)

      expect(Buffer.from(pdf.slice(0, 5)).toString('latin1')).toBe('%PDF-')
      expect(pdf.byteLength).toBeGreaterThan(1000)
    }

    writeProofArtefact(`${OUT}/INDEX.txt`, `${index.join('\n')}\n`)
    expect(index.length).toBe(POSTER_SET.length)
    // Six PDFs, two of them embedding real multi-hundred-kilobyte photographs
    // and all six embedding and subsetting four font faces. That is about 2.8s
    // alone and comfortably over vitest's 5s default when the suite runs it
    // alongside everything else, so the budget is explicit rather than left to
    // whatever else happens to be scheduled at the same time.
  }, 30_000)
})
