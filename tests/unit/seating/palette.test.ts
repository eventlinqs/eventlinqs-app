import { describe, it, expect } from 'vitest'
import {
  SECTION_COLORS,
  LEGACY_COLOR_REMAP,
  editorialSectionColor,
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
