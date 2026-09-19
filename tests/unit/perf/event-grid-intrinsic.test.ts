/**
 * The reserved height a section declares is arithmetic, and arithmetic can be
 * checked without a browser.
 *
 * WHAT THIS COVERS THAT THE DRIVE DOES NOT. The drive
 * (scripts/verify/event-grid-intrinsic-drive.mjs) serves a build, scrolls
 * three real pages and compares the reservation with the rendered height. It
 * is the proof, and it is slow, needs a build, and only visits the card counts
 * those pages happen to hold. These cases cover the edges it never sees: one
 * card, a count that does not divide by three, the boundary where a row is
 * added, and the empty grid that must NOT get an estimate at all.
 *
 * WHAT IT DOES NOT COVER, said plainly: nothing here proves the numbers
 * describe the real page. `eventGridIntrinsicPx` and the `calc()` strings come
 * from the same constants, so a wrong constant passes every case below and
 * fails on the drive. That is the division of labour, not a gap being hidden.
 */
import { describe, it, expect } from 'vitest'
import {
  eventGridIntrinsicSize,
  eventGridIntrinsicCss,
  eventGridIntrinsicPx,
  EVENT_GRID_GEOMETRY,
} from '@/lib/ui/event-grid-intrinsic'

describe('eventGridIntrinsicSize', () => {
  it('returns nothing for an empty grid, so the empty state keeps the rail reservation', () => {
    expect(eventGridIntrinsicSize(0)).toBeNull()
    expect(eventGridIntrinsicSize(-1)).toBeNull()
    expect(eventGridIntrinsicSize(Number.NaN)).toBeNull()
  })

  it('counts the rows the grid will have, one, two and three across', () => {
    expect(eventGridIntrinsicSize(24)).toEqual({ base: 24, md: 12, lg: 8 })
  })

  it('rounds a part row up, because a part row is still a row', () => {
    expect(eventGridIntrinsicSize(7)).toEqual({ base: 7, md: 4, lg: 3 })
  })

  it('reserves one row for a grid holding one card', () => {
    expect(eventGridIntrinsicSize(1)).toEqual({ base: 1, md: 1, lg: 1 })
  })

  it('ignores a fractional count rather than reserving a fraction of a card', () => {
    expect(eventGridIntrinsicSize(7.9)).toEqual(eventGridIntrinsicSize(7))
  })
})

describe('eventGridIntrinsicCss', () => {
  it('names the row variable once per band, with a fallback', () => {
    for (const band of EVENT_GRID_GEOMETRY.bands) {
      const css = eventGridIntrinsicCss(band)
      expect(css).toMatch(/^calc\(/)
      // The fallback is load-bearing: an undefined custom property makes the
      // whole calc invalid, and an invalid contain-intrinsic-size on a skipped
      // element reserves nothing at all.
      expect(css).toContain(`var(--cv-r-${band}, 1)`)
      expect(css.match(new RegExp(`--cv-r-${band}`, 'g'))!.length).toBe(1)
      expect(css).toContain('min(100vw, 1400px)')
    }
  })

  it('agrees with the pixel arithmetic the drive checks against a real page', () => {
    // Evaluate the CSS by hand at one viewport per band and compare with
    // `eventGridIntrinsicPx`. If the two ever diverge, the stylesheet and the
    // tests are measuring different platforms.
    const cases = [
      { band: 'base' as const, viewport: 390, rows: 24, cards: 24 },
      { band: 'md' as const, viewport: 768, rows: 12, cards: 24 },
      { band: 'lg' as const, viewport: 1440, rows: 8, cards: 24 },
    ]
    for (const c of cases) {
      const g = EVENT_GRID_GEOMETRY
      const columns = g.columns[c.band]
      const inset = 2 * g.wrapperPadPx[c.band] + (columns - 1) * g.gapPx
      const columnWidth = (Math.min(c.viewport, g.containerMaxPx) - inset) / columns - g.cardBorderPx
      const rowPlusGap = columnWidth * g.mediaRatio[c.band] + g.cardBodyPx + g.gapPx
      const fromCss = c.rows * rowPlusGap + (g.sectionChromePx[c.band] - g.gapPx)
      expect(Math.abs(fromCss - eventGridIntrinsicPx(c.cards, c.band, c.viewport)!)).toBeLessThan(0.001)
    }
  })
})

describe('eventGridIntrinsicPx', () => {
  /**
   * THE MEASUREMENTS THIS ARITHMETIC HAS TO REPRODUCE, read off the production
   * build on 19 September 2026 by `event-grid-intrinsic-drive.mjs --derive`.
   * If a constant is edited without re-deriving, these fail here rather than
   * forty minutes into a push.
   */
  const MEASURED = [
    { what: '/city/melbourne', cards: 24, band: 'base' as const, viewport: 390, real: 9066.8, pad: 128 },
    { what: '/city/melbourne', cards: 24, band: 'md' as const, viewport: 768, real: 5356.4, pad: 160 },
    { what: '/city/melbourne', cards: 24, band: 'lg' as const, viewport: 1440, real: 4164.3, pad: 192 },
    { what: '/city/melbourne/inner-melbourne', cards: 9, band: 'base' as const, viewport: 390, real: 3535, pad: 128 },
    { what: '/city/melbourne/inner-melbourne', cards: 9, band: 'md' as const, viewport: 768, real: 2360.2, pad: 160 },
    { what: '/city/melbourne/inner-melbourne', cards: 9, band: 'lg' as const, viewport: 1440, real: 1719.1, pad: 192 },
  ]

  for (const m of MEASURED) {
    it(`reproduces ${m.what} at ${m.viewport} to within a pixel (${m.real}px measured, ${m.pad}px of it padding)`, () => {
      /* The reservation is a CONTENT-box height: the browser adds the
       * section's `py-16 md:py-20 lg:py-24` to it. Comparing it with the
       * BORDER box is what let a 128px error through on the first pass, so
       * the padding is subtracted here explicitly rather than folded into a
       * constant where nobody can see it. */
      const predicted = eventGridIntrinsicPx(m.cards, m.band, m.viewport)
      expect(predicted).not.toBeNull()
      expect(Math.abs(predicted! + m.pad - m.real)).toBeLessThan(1)
    })
  }

  it('is capped by the sitewide container, so a wider viewport does not widen the cards', () => {
    const at1440 = eventGridIntrinsicPx(24, 'lg', 1440)
    const at1920 = eventGridIntrinsicPx(24, 'lg', 1920)
    expect(at1920).toBe(at1440)
  })

  it('grows with the viewport inside a band, which is the whole reason it is a calc', () => {
    expect(eventGridIntrinsicPx(24, 'base', 320)!).toBeLessThan(eventGridIntrinsicPx(24, 'base', 430)!)
  })

  it('returns nothing for an empty grid, exactly as the CSS form does', () => {
    expect(eventGridIntrinsicPx(0, 'base', 390)).toBeNull()
  })
})
