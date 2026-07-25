import { describe, it, expect } from 'vitest'
import {
  SECTION_COLORS,
  LEGACY_COLOR_REMAP,
  editorialSectionColor,
  SEAT_PALETTE_SETS,
  SEAT_PALETTE_SET_META,
  sectionColorForSet,
  type SeatPaletteSetId,
} from '@/lib/seating/palette'

/** Relative luminance for a #rrggbb hex, sRGB per WCAG 2.x. */
function luminance(hex: string): number {
  const c = hex
    .slice(1)
    .match(/../g)!
    .map(h => parseInt(h, 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05)
}

describe('seating palette', () => {
  it('every editorial tone passes 4.5:1 with a white seat numeral', () => {
    for (const tone of SECTION_COLORS) {
      expect(contrastWithWhite(tone)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('remaps every retired material bright to an editorial tone, case-insensitively', () => {
    for (const [legacy, editorial] of Object.entries(LEGACY_COLOR_REMAP)) {
      expect(editorialSectionColor(legacy)).toBe(editorial)
      expect(editorialSectionColor(legacy.toUpperCase())).toBe(editorial)
      expect(SECTION_COLORS).toContain(editorial as (typeof SECTION_COLORS)[number])
    }
  })

  it('passes a genuinely chosen colour through unchanged', () => {
    expect(editorialSectionColor('#123456')).toBe('#123456')
    expect(editorialSectionColor(SECTION_COLORS[3])).toBe(SECTION_COLORS[3])
  })

  it('falls back to the first tone for a null or empty colour', () => {
    expect(editorialSectionColor(null)).toBe(SECTION_COLORS[0])
    expect(editorialSectionColor(undefined)).toBe(SECTION_COLORS[0])
    expect(editorialSectionColor('')).toBe(SECTION_COLORS[0])
  })
})

describe('colour-vision palette sets', () => {
  const cvdSets: SeatPaletteSetId[] = ['protan', 'deutan', 'tritan']

  it('every tone of every set passes 4.5:1 with a white seat numeral', () => {
    for (const tones of Object.values(SEAT_PALETTE_SETS)) {
      for (const tone of tones) {
        expect(contrastWithWhite(tone)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('the meta list names all four sets exactly once, house first', () => {
    expect(SEAT_PALETTE_SET_META.map(m => m.id)).toEqual(['house', 'protan', 'deutan', 'tritan'])
  })

  it('house is a pure pass-through of the editorial mapping', () => {
    expect(sectionColorForSet(SECTION_COLORS[2], 'house')).toBe(SECTION_COLORS[2])
    expect(sectionColorForSet('#0ea5e9', 'house')).toBe(SECTION_COLORS[0])
    expect(sectionColorForSet('#123456', 'house')).toBe('#123456')
  })

  it('each house tone maps to a stable set tone by index modulo the set length', () => {
    for (const set of cvdSets) {
      const ramp = SEAT_PALETTE_SETS[set]
      SECTION_COLORS.forEach((tone, i) => {
        expect(sectionColorForSet(tone, set)).toBe(ramp[i % ramp.length])
      })
    }
  })

  it('a retired material bright resolves through its editorial tone first', () => {
    for (const set of cvdSets) {
      const ramp = SEAT_PALETTE_SETS[set]
      // '#4caf50' remaps to SECTION_COLORS[2], so the set tone at index 2.
      expect(sectionColorForSet('#4caf50', set)).toBe(ramp[2])
    }
  })

  it('an unknown custom colour snaps to its nearest house tone, so every chart separates', () => {
    for (const set of cvdSets) {
      const result = sectionColorForSet('#1f5770', set) // a hair off harbour blue
      expect(result).toBe(SEAT_PALETTE_SETS[set][0])
    }
  })

  it('adjacent set tones never collide within a set', () => {
    for (const set of cvdSets) {
      const ramp = SEAT_PALETTE_SETS[set]
      expect(new Set(ramp.map(t => t.toLowerCase())).size).toBe(ramp.length)
    }
  })
})
