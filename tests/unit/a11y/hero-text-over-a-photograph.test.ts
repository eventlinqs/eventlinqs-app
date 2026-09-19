import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HERO_CAPTION_BASE_ALPHA,
  HERO_CAPTION_DEEPEN,
  HERO_CAPTION_FADE,
  HERO_CAPTION_MIN_ALPHA,
  HERO_CAPTION_SCRIM,
  HERO_HEADER_SCRIM,
} from '@/components/media/hero-photo-scrim'

/**
 * HERO TEXT OVER A PHOTOGRAPH, 19 September 2026.
 *
 * Four hero templates each carried their own navy gradient, the four disagreed,
 * and every stop in all four was a percentage of the hero BAND while the text
 * is bottom-anchored and hugs its own content. The wash was therefore making a
 * promise about text whose position it could not know. Driven with
 * `scripts/verify/hero-text-over-photograph-drive.mjs`, which hides each run and
 * reads the pixels revealed behind it, the gold eyebrow on
 * /categories/technology measured 1.38:1 at 390, 3.33:1 at 768 and 10.67:1 at
 * 1440 against a floor of 4.5 - one page, one photograph, three widths.
 *
 * These cases hold the two things that make the replacement a guarantee: the
 * strength is enough for the colour the constitution fixes, and the geometry
 * does not depend on how tall the text happens to be.
 */

/* WCAG 2.2 SC 1.4.3, evaluated here rather than quoted.
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html */
const srgb = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]: number[]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const contrast = (a: number[], b: number[]) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
const NAVY = [10, 22, 40]
/** Under text, the worst thing a photograph can be is white. */
const WORST_PHOTOGRAPH = [255, 255, 255]
const washed = (alpha: number) => NAVY.map((n, i) => alpha * n + (1 - alpha) * WORST_PHOTOGRAPH[i])

/** gold-400, read from the stylesheet rather than repeated here. */
const goldFromGlobals = () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const m = css.match(/--color-gold-400:\s*#([0-9A-Fa-f]{6})/)
  if (!m) throw new Error('globals.css no longer declares --color-gold-400')
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
}

describe('the hero caption wash', () => {
  it('is strong enough for the gold eyebrow the constitution fixes, over the brightest photograph possible', () => {
    // The eyebrow's colour is not a free variable: CLAUDE.md requires "a GOLD
    // eyebrow (--brand-accent on the dark hero, never a white eyebrow)". So the
    // surface under it is the only thing that can carry the floor.
    const gold = goldFromGlobals()
    expect(contrast(gold, washed(HERO_CAPTION_MIN_ALPHA))).toBeGreaterThanOrEqual(4.5)
  })

  it('carries the white headline and the 85 per cent subtitle as well', () => {
    const bg = washed(HERO_CAPTION_MIN_ALPHA)
    // The headline is >= 24px, so SC 1.4.3's large-text floor of 3:1 applies.
    expect(contrast([255, 255, 255], bg)).toBeGreaterThanOrEqual(3)
    // The subtitle is text-white/85 and normal size: it composites toward its
    // own background, so the pair it is judged on is the composited colour.
    const subtitle = bg.map(c => 0.85 * 255 + 0.15 * c)
    expect(contrast(subtitle, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('reaches full strength by the first line of text, not at it', () => {
    // The wash starts HERO_CAPTION_FADE above the caption's own top edge and is
    // already at the floor when it arrives there.
    expect(HERO_CAPTION_SCRIM).toContain(`rgba(10,22,40,${HERO_CAPTION_MIN_ALPHA}) ${HERO_CAPTION_FADE}`)
    expect(HERO_CAPTION_SCRIM.startsWith('linear-gradient(to bottom, rgba(10,22,40,0) 0,')).toBe(true)
  })

  it('deepens below the text without ever going back under the floor', () => {
    expect(HERO_CAPTION_BASE_ALPHA).toBeGreaterThanOrEqual(HERO_CAPTION_MIN_ALPHA)
    expect(HERO_CAPTION_SCRIM).toContain(`rgba(10,22,40,${HERO_CAPTION_BASE_ALPHA}) ${HERO_CAPTION_DEEPEN}`)
  })

  it('states both ends of the ramp as absolute lengths, which is what makes the promise layout-independent', () => {
    // A percentage here is the 1.38:1 defect returning: it would make the wash
    // depend on the element's height again, and the element hugs text whose
    // height changes with every headline and every viewport.
    for (const length of [HERO_CAPTION_FADE, HERO_CAPTION_DEEPEN]) {
      expect(length).toMatch(/^[0-9.]+(rem|px|em)$/)
    }
    expect(HERO_CAPTION_SCRIM).not.toMatch(/\d%/)
  })
})

describe('the hero header wash', () => {
  it('is top-anchored and released by a fifth down, because it answers a different question', () => {
    // The transparent header IS pinned to the top of the band, so a percentage
    // can find it. This is the one wash a percentage is right for.
    expect(HERO_HEADER_SCRIM.startsWith('linear-gradient(to bottom,')).toBe(true)
    expect(HERO_HEADER_SCRIM).toContain('rgba(10,22,40,0) 22%')
  })

  it('keeps the reviewed strength through the band the header actually covers', () => {
    // PhotographicCityHero recorded 0.55 falling to 0.20 by 12 per cent as a
    // "Fix from Batch 11.0 founder review". Unifying the four templates onto the
    // LIGHTER shipped shape would have undone that fix silently.
    expect(HERO_HEADER_SCRIM).toContain('rgba(10,22,40,0.55) 0%')
    expect(HERO_HEADER_SCRIM).toContain('rgba(10,22,40,0.2) 12%')
  })
})

describe('every hero that paints text on a photograph', () => {
  const HEROES = [
    'src/components/templates/PhotographicCategoryHero.tsx',
    'src/components/templates/PhotographicCityHero.tsx',
    'src/components/templates/PhotographicCommunityHero.tsx',
    'src/components/features/city/city-hero.tsx',
  ]

  it.each(HEROES)('%s writes no navy gradient of its own', file => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/linear-gradient\([^)]*rgba?\(\s*10\s*,\s*22\s*,\s*40/)
  })

  it.each(HEROES)('%s puts its text inside <HeroCaption>', file => {
    expect(readFileSync(file, 'utf8')).toContain('HeroCaption')
  })

  it.each(HEROES)('%s clips its band, which is what trims the full-width bleed', file => {
    expect(readFileSync(file, 'utf8')).toContain('overflow-hidden')
  })
})
