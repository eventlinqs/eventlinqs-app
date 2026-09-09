// The venue pin carries the venue name (close-out UX2.2).
//
// On the first real organiser event the venue rendered as an unlabelled 20px
// gold dot whose only label was a `title` attribute, which is a hover tooltip
// and therefore does not exist on a phone. Every surrounding commercial POI on
// the basemap carried a labelled marker, so the one point the page is about was
// the least legible thing on the map.
//
// WHY THIS IS A DOM TEST RATHER THAN A DRIVEN SCREENSHOT. The Google Maps
// browser key is restricted by HTTP referrer and localhost is not on the list,
// so a local run answers RefererNotAllowedMapError and never paints a map at
// all. The pin element itself is pure DOM and is fully testable here; the
// visual confirmation needs the referrer allowance, which is a Google Cloud
// console change and therefore the founder's.

import { describe, expect, test } from 'vitest'
import { BRAND_GOLD, createBrandPin, createVenuePin } from '@/lib/maps/brand-pin'

/**
 * jsdom normalises a hex colour to `rgb(r, g, b)` when it is read back off a
 * style property. Converting here rather than hard-coding the rgb triple keeps
 * these assertions correct if the brand gold is ever re-picked.
 */
function asRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('the labelled venue pin', () => {
  test('carries the venue name as REAL TEXT, not a hover tooltip', () => {
    const pin = createVenuePin({ name: 'The Wool Exchange' })
    // The text a finger cannot hover over still has to be readable.
    expect(pin.textContent).toContain('The Wool Exchange')
  })

  test('and keeps the tooltip as well, for a pointer', () => {
    const pin = createVenuePin({ name: 'The Wool Exchange' })
    expect(pin.title).toBe('The Wool Exchange')
  })

  test('is solid, never translucent, because CLAUDE.md bans glassmorphism', () => {
    const pin = createVenuePin({ name: 'Quakers Centre' })
    expect(pin.style.background).toBeTruthy()
    expect(pin.style.background).not.toContain('rgba')
    expect(pin.style.backdropFilter ?? '').toBe('')
  })

  test('wears the brand gold on the dot and the border', () => {
    const pin = createVenuePin({ name: 'Quakers Centre' })
    const dot = pin.querySelector('span')
    expect(pin.style.border).toContain(asRgb(BRAND_GOLD))
    expect(dot?.style.background).toBe(asRgb(BRAND_GOLD))
  })

  test('long names are bounded rather than allowed to run across the map', () => {
    const pin = createVenuePin({
      name: 'The Extremely Long Community Hall And Performance Centre Of West Melbourne',
    })
    expect(pin.style.maxWidth).toBe('260px')
    expect(pin.style.overflow || pin.querySelector('span:last-child')?.style.overflow).toBeTruthy()
  })

  test('falls back to the plain dot when there is no name to show', () => {
    // A plate with no words in it would be worse than the dot it replaced.
    for (const empty of [undefined, null, '', '   ']) {
      const pin = createVenuePin({ name: empty })
      expect(pin.textContent).toBe('')
    }
  })

  test('the plain dot is unchanged, because the multi-point maps still use it', () => {
    // Forty labelled plates is a worse map, not a better one, so the city and
    // events maps keep the dot. This pins that the change did not leak.
    const dot = createBrandPin({ title: 'somewhere' })
    expect(dot.style.background).toBe(asRgb(BRAND_GOLD))
    expect(dot.textContent).toBe('')
  })

  test('anchors so the marked point is the coordinate, not somewhere above it', () => {
    // An advanced marker anchors its content by the BOTTOM CENTRE, so without a
    // transform the plate would float above the venue.
    const pin = createVenuePin({ name: 'The Wool Exchange' })
    expect(pin.style.transform).toBe('translateY(50%)')
  })
})
