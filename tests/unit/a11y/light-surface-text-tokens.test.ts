import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CORAL IS NOT A TEXT COLOUR ON A LIGHT SURFACE.
 *
 * Found by axe on 5 September 2026, during the A4 drive, the first run that
 * ever reached a tier with two tickets left under a scan: the ticket
 * selector's "Only 2 left" line was painted coral-500 on the white ticket
 * card, which measures 3.28:1, and the access-code error beside it was
 * coral-600, 4.13:1. Neither meets WCAG AA (4.5:1), and no coral token does
 * on white (globals.css carries three; the darkest is 4.13:1). The design
 * system's answer to this shape already existed for gold (gold-400 on dark,
 * gold-800 as text on light) and for error (error as border and icon,
 * error-strong as text on light, 6.47:1 on white). The scarcity line is the
 * last-chance message, which the badge library already keys to the error hue
 * (BADGE_STYLES.last_chance), so both lines now use error-strong. Coral stays
 * where it belongs: the live dots and pings, where contrast does not apply.
 *
 * This test reads the two files rather than rendering them, because the
 * defect is a class name and a class name is what would regress.
 */
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const LIGHT_SURFACE_TEXT_FILES = [
  'src/components/checkout/ticket-selector.tsx',
  'src/components/features/events/access-code-input.tsx',
]

describe('coral is never a text colour on the light ticket surfaces', () => {
  test.each(LIGHT_SURFACE_TEXT_FILES)('%s paints no text coral', (rel) => {
    const src = read(rel)
    expect(src).not.toMatch(/\btext-coral-\d{3}\b/)
  })

  test('the scarcity line uses the error-strong text token', () => {
    const src = read('src/components/checkout/ticket-selector.tsx')
    expect(src).toMatch(/text-error-strong">Only \{available\} left</)
  })

  test('the access-code refusal uses the error-strong text token', () => {
    const src = read('src/components/features/events/access-code-input.tsx')
    expect(src).toMatch(/<p className="mt-2 text-xs text-error-strong">\{error\}<\/p>/)
  })

  test('error-strong is a real token and clears 4.5:1 on white', () => {
    const css = read('src/app/globals.css')
    const hex = css.match(/--color-error-strong:\s*(#[0-9a-fA-F]{6})/)?.[1]
    expect(hex).toBeTruthy()
    const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex!.slice(i, i + 2), 16) / 255))
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const ratio = 1.05 / (luminance + 0.05)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})
