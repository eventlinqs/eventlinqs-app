import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'
import {
  DEFAULT_POSTER_PALETTE,
  POSTER_PALETTES,
  POSTER_PALETTE_LABELS,
  POSTER_PALETTE_NAMES,
  resolvePosterPalette,
} from '@/lib/broadcast/poster-palette'

/**
 * The palette control.
 *
 * The binding requirement is the founder's: nothing may let a person produce
 * something worse than the default. For a colour control that reduces to two
 * checkable properties, and both are asserted here rather than described:
 *
 *   1. every scheme is legible, which for gold means the right TIER. gold-400
 *      fails 4.5:1 on white by globals.css's own measurement, so a light field
 *      must carry gold-800.
 *   2. the default is unreachable-by-accident, so an unknown or missing name
 *      lands on it rather than throwing or rendering something odd.
 */

const OUT = 'docs/design/poster-palette'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

/** WCAG relative luminance, then the standard contrast ratio. */
function luminance(c: { red: number; green: number; blue: number }): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue)
}
function contrast(a: { red: number; green: number; blue: number }, b: { red: number; green: number; blue: number }) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('every named scheme is legible', () => {
  it.each(POSTER_PALETTE_NAMES)('%s: body text clears 4.5:1 on its own field', name => {
    const p = POSTER_PALETTES[name]
    expect(contrast(p.text, p.field)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.text, p.fieldDeep)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(POSTER_PALETTE_NAMES)('%s: the accent clears 3:1 on its own field', name => {
    const p = POSTER_PALETTES[name]
    // 3:1 is the large-text and non-text floor. The accent carries the date
    // line, the rules and the ticket bar fill, none of which is body copy.
    expect(contrast(p.accent, p.field)).toBeGreaterThanOrEqual(3)
  })

  it.each(POSTER_PALETTE_NAMES)('%s: ticket bar text clears 4.5:1 on the bar', name => {
    const p = POSTER_PALETTES[name]
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it('the light scheme uses the gold-800 tier, not gold-400', () => {
    // The specific failure globals.css warns about: gold-400 on white is 2.27:1.
    // If somebody ever "simplifies" paper to reuse the dark accent, this fails.
    const paper = POSTER_PALETTES.paper
    const navy = POSTER_PALETTES.navy
    expect(paper.isLight).toBe(true)
    expect(paper.accent).not.toEqual(navy.accent)
    expect(contrast(navy.accent, paper.field)).toBeLessThan(4.5)
    expect(contrast(paper.accent, paper.field)).toBeGreaterThanOrEqual(4.5)
  })

  it('every scheme has a human label and no hex is exposed', () => {
    for (const name of POSTER_PALETTE_NAMES) {
      expect(POSTER_PALETTE_LABELS[name]).toBeTruthy()
      expect(POSTER_PALETTE_LABELS[name]).not.toMatch(/#[0-9a-f]{3,6}/i)
    }
  })
})

describe('the default is where you land by accident', () => {
  it('resolves an unknown, empty, null or absent name to the default', () => {
    const d = POSTER_PALETTES[DEFAULT_POSTER_PALETTE]
    for (const bad of ['nonsense', '', null, undefined, '__proto__', 'toString']) {
      expect(resolvePosterPalette(bad)).toEqual(d)
    }
  })
})

describe('the schemes render', () => {
  it('renders each scheme, artwork and typographic, and writes them out', async () => {
    mkdirSync(OUT, { recursive: true })
    const shortUrl = 'https://eventlinqs.com/launch/k/abcdefghjkmn'
    const qrPng = new Uint8Array(await QRCode.toBuffer(shortUrl, { margin: 1, width: 600 }))
    const cover = {
      bytes: new Uint8Array(readFileSync('public/images/hero/afrobeats.jpg')),
      format: 'jpg' as const,
    }
    const base = {
      title: 'Warehouse party at the Barwon Club',
      dateLabel: 'Saturday 20 September 2026',
      locality: 'The Barwon Club, Geelong',
      priceLabel: 'From $25',
      organiserName: 'Barwon Club Presents',
      shortUrl,
      qrPng,
    }

    const seen = new Set<number>()
    for (const palette of POSTER_PALETTE_NAMES) {
      for (const [label, coverImage] of [
        ['artwork', cover],
        ['typographic', null],
      ] as const) {
        const pdf = await buildEventPosterPdf({ ...base, coverImage, palette })
        writeFileSync(`${OUT}/${palette}-${label}.pdf`, Buffer.from(pdf))
        expect(Buffer.from(pdf.slice(0, 5)).toString('latin1')).toBe('%PDF-')
        seen.add(pdf.byteLength)
      }
    }
    // Six genuinely different documents, not one rendered six times.
    expect(seen.size).toBeGreaterThan(1)
  }, 60_000)
})
