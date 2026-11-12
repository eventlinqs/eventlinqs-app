import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEDIA_SIZES } from '@/components/media/sizes'

/*
 * A CITY GUIDE PHOTOGRAPH IS FETCHED FOR ITS OWN BOX (WINDOW 5A, 11 November 2026). One hint served three boxes: the
 * 112px row hint went to the full-width Big nights card and the guide's rail card too, so a phone fetched a 128 to 256px
 * image for a 356px slot and AMCF's lead photograph on Melbourne's guide showed blocky on www. The rule held here is the
 * one image-hints-match-the-cell holds everywhere else: a hint may be larger than its slot, never smaller.
 *
 * The slot widths are measured on www (C:\dev\EVIDENCE\EL-11NOV\spine-masters\guide-slots.json) or derived from the
 * cell's own classes; the resolver is a separate implementation from anything in src/, so the two cannot agree about a
 * rule neither holds.
 */

/** A `sizes` string resolved the way a browser does: the first entry whose media condition matches, at a viewport. */
function resolveHint(sizes: string, viewport: number): number {
  for (const raw of sizes.split(',')) {
    const entry = raw.trim()
    const m = entry.match(/^\((min|max)-width:\s*(\d+)px\)\s+(.+)$/)
    const value = m ? m[3] : entry
    if (m) {
      const bound = Number(m[2])
      const matches = m[1] === 'min' ? viewport >= bound : viewport <= bound
      if (!matches) continue
    }
    const px = value.match(/^(\d+(?:\.\d+)?)px$/)
    if (px) return Number(px[1])
    const vw = value.match(/^(\d+(?:\.\d+)?)vw$/)
    if (vw) return (Number(vw[1]) / 100) * viewport
    throw new Error(`a hint entry this test cannot read: '${entry}'`)
  }
  throw new Error(`no entry of '${sizes}' applies at ${viewport}px`)
}

describe('the guide photograph hints are never smaller than their box', () => {
  it('the Big nights card: at least the width measured on www at every viewport', () => {
    const measured: Array<[number, number]> = [[320, 286], [390, 356], [768, 227], [1024, 307], [1440, 433]]
    for (const [viewport, slot] of measured) {
      expect(resolveHint(MEDIA_SIZES.guideBigCard, viewport), `Big nights at ${viewport}px`).toBeGreaterThanOrEqual(slot)
    }
  })

  it('the rail card: at least its cell, 78% of a phone\'s content width and 256px from sm', () => {
    for (const viewport of [320, 360, 390, 430, 639, 640, 768, 1024, 1440]) {
      const slot = viewport < 640 ? 0.78 * (viewport - 32) : 256
      expect(resolveHint(MEDIA_SIZES.guideRailCard, viewport), `rail card at ${viewport}px`).toBeGreaterThanOrEqual(slot)
    }
  })

  it('the row keeps its own small hint: 112px on a phone, 160px from md', () => {
    expect(resolveHint(MEDIA_SIZES.rowThumb, 390)).toBe(112)
    expect(resolveHint(MEDIA_SIZES.rowThumb, 1440)).toBe(160)
  })

  it('the row hint is far smaller than either card, which is why it can never stand in for one', () => {
    expect(resolveHint(MEDIA_SIZES.rowThumb, 390)).toBeLessThan(0.5 * resolveHint(MEDIA_SIZES.guideBigCard, 390))
    expect(resolveHint(MEDIA_SIZES.rowThumb, 390)).toBeLessThan(0.5 * resolveHint(MEDIA_SIZES.guideRailCard, 390))
  })
})

describe('every guide photograph names its box (the class cannot return)', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'src', 'components', 'features', 'city-guide', 'city-guide.tsx'), 'utf8').replace(/\r\n/g, '\n')

  it('WholePhoto takes its box from the caller, with no default to fall back on', () => {
    const decl = src.slice(src.indexOf('function WholePhoto('), src.indexOf('function BigCard('))
    expect(decl).toContain("variant: 'guide-big-card' | 'guide-rail-card' | 'row-thumb'; priority?: boolean }")
    expect(decl).not.toMatch(/variant\s*=\s*'/)
    expect(decl.match(/variant=\{variant\}/g)?.length).toBe(2)
    expect(decl).not.toContain('variant="row-thumb"')
  })

  it('each of the three boxes passes its own hint', () => {
    expect(src).toContain('className="aspect-[3/2] w-full" variant="guide-big-card"')
    expect(src).toContain('className="aspect-[4/3] w-full" variant="guide-rail-card"')
    expect(src).toContain('className="aspect-[4/3] w-28 shrink-0 self-start rounded-lg md:w-40" variant="row-thumb"')
  })

  it('no WholePhoto is drawn without naming its box', () => {
    const calls = src.match(/<WholePhoto\b[^>]*\/>/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const call of calls) expect(call, call).toMatch(/\bvariant="(guide-big-card|guide-rail-card|row-thumb)"/)
  })
})
