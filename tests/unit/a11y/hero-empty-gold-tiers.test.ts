import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * THE TWO GOLD TIERS ARE NOT INTERCHANGEABLE, and the shared designed empty
 * state proved it on 19 September 2026 by getting both of them wrong at once.
 *
 * `CategoryHeroEmpty` renders on every city, suburb, community-by-city,
 * category, weekend, feed, artist, organiser and venue page that has no events.
 * It paints itself either as a photograph with a navy scrim or as a light
 * canvas card, and seven of its nine colour decisions branched on that flag.
 * The two that did not were the eyebrow and the trust-pillar icon, and each had
 * been given the tier belonging to the OTHER surface.
 *
 * This file holds the arithmetic rather than the markup. The ratios are
 * computed from globals.css on every run, so retuning either gold token fails
 * HERE, with the number, instead of silently moving a live surface under its
 * floor. The component test beside it (tests/component/ui/category-hero-empty)
 * proves the markup picks the tier this file says it should.
 *
 * FLOORS, from the primary source rather than from memory (Law 7):
 *   WCAG 2.2 SC 1.4.3 Contrast (Minimum): 4.5:1 for normal text, 3:1 for large
 *     text, large being at least 18.5px (14pt) bold or 24px (18pt).
 *     https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *   WCAG 2.2 SC 1.4.11 Non-text Contrast: 3:1 for a graphical object.
 *     https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
 *   Both fetched 2026-09-19. Neither ratio may be rounded up to its floor: the
 *   W3C says so explicitly, "4.499:1 would not meet the 4.5:1 threshold".
 *
 * The eyebrow is 12px (`text-xs`), so it is NORMAL text and takes 4.5:1. It is
 * not large text and the lower floor does not apply to it.
 */

const ROOT = process.cwd()
const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

const TOKENS = new Map<string, string>()
for (const m of CSS.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) {
  TOKENS.set(m[1], m[2].toUpperCase())
}

function aliasOf(name: string): string {
  const m = CSS.match(new RegExp(`--${name}:\\s*var\\(--color-([a-z0-9-]+)\\)`))
  if (!m) throw new Error(`globals.css does not alias --${name} to a --color-* token`)
  return m[1]
}
function hexOf(alias: string): string {
  const hex = TOKENS.get(alias)
  if (!hex) throw new Error(`globals.css declares no hex for --color-${alias}`)
  return hex
}

const channel = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = (hex: string) =>
  0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
  0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
  0.0722 * channel(parseInt(hex.slice(5, 7), 16))
const contrast = (a: string, b: string) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}

const AA_NORMAL_TEXT = 4.5 // SC 1.4.3
const AA_GRAPHICAL = 3 // SC 1.4.11

const GOLD_400 = hexOf(aliasOf('brand-accent'))
const GOLD_800 = hexOf(aliasOf('brand-accent-strong'))
const LIGHT = hexOf(aliasOf('surface-1')) // the imageless card body
const DARK = hexOf('navy-950') // the photo hero base under its navy scrim

describe('the gold tier a surface is entitled to', () => {
  it('reads the four ratios out of globals.css rather than holding a copy', () => {
    // A guard against the tokens quietly ceasing to be what this file assumes.
    expect(GOLD_400).toMatch(/^#[0-9A-F]{6}$/)
    expect(GOLD_800).toMatch(/^#[0-9A-F]{6}$/)
    expect(GOLD_400).not.toBe(GOLD_800)
  })

  it('gold-800 on the light card clears the normal-text floor, and gold-400 does not', () => {
    expect(contrast(GOLD_800, LIGHT)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    // The defect of 19 September: the trust-pillar icon painted this.
    expect(contrast(GOLD_400, LIGHT)).toBeLessThan(AA_GRAPHICAL)
  })

  it('gold-800 on the light card clears the graphical-object floor for the icon', () => {
    expect(contrast(GOLD_800, LIGHT)).toBeGreaterThanOrEqual(AA_GRAPHICAL)
  })

  it('gold-400 on the photo hero clears the normal-text floor, and gold-800 does not', () => {
    expect(contrast(GOLD_400, DARK)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    // The mirror defect of the same day: the eyebrow painted this.
    expect(contrast(GOLD_800, DARK)).toBeLessThan(AA_NORMAL_TEXT)
  })

  it('each tier is better on its own surface than the other tier is, by a wide margin', () => {
    // The point of the law, stated as arithmetic: swapping them is not a near
    // miss, it is the worst available answer on both surfaces at once.
    expect(contrast(GOLD_800, LIGHT)).toBeGreaterThan(contrast(GOLD_400, LIGHT) * 3)
    expect(contrast(GOLD_400, DARK)).toBeGreaterThan(contrast(GOLD_800, DARK) * 3)
  })
})

describe('the guard that holds the branch refuses to pass vacuously', () => {
  /**
   * The drill harness mutates ONE file per drill, and emptying this guard's
   * scope needs every surface-flagged file gone at once, so the refusal cannot
   * be drilled. It is executed here instead: the guard is pointed at a fixture
   * tree holding a component with gold in it and no surface flag, which is
   * exactly the state a future refactor would leave behind.
   */
  it('exits non-zero when nothing in the scanned tree declares a surface flag', () => {
    const dir = mkdtempSync(join(tmpdir(), 'surface-flag-'))
    try {
      const fixture = join(dir, 'fixture')
      mkdirSync(fixture)
      writeFileSync(
        join(fixture, 'no-flag.tsx'),
        'export const A = () => <p className="text-[var(--brand-accent)]">gold</p>\n',
        'utf8',
      )
      let code = 0
      let output = ''
      try {
        output = execFileSync(
          process.execPath,
          [join(ROOT, 'scripts/guards/surface-flag-colours-branch.mjs')],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              SURFACE_FLAG_SCAN_ROOT: relative(ROOT, fixture),
            },
          },
        )
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string }
        code = e.status ?? -1
        output = `${e.stdout ?? ''}${e.stderr ?? ''}`
      }
      expect(code).toBe(1)
      expect(output).toContain('declares a surface flag any more')
      // The redirect must be visible in the log, never silent.
      expect(output).toContain('fixture')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
