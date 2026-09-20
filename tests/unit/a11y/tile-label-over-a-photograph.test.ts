import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HERO_CAPTION_FADE, HERO_CAPTION_MIN_ALPHA } from '@/components/media/hero-photo-scrim'
import {
  TILE_CAPTION_BASE_ALPHA,
  TILE_CAPTION_DEEPEN,
  TILE_CAPTION_FADE,
  TILE_CAPTION_MAX_SHARE,
  TILE_CAPTION_MIN_ALPHA,
  TILE_CAPTION_SCRIM,
} from '@/components/media/tile-photo-scrim'
/*
 * The one derivation, read here exactly as the guard reads it. A `.mjs` under
 * scripts/ is deliberate: this is the same module the build-time guard loads,
 * so the suite cannot agree with a second copy of the rules.
 */
import {
  allTsxFiles,
  deriveTileLabelSurfaces,
  deriveTilePainters,
  paintsOwnTileWash,
  rendersTileCaption,
  tileCaptionClassNames,
} from '../../../scripts/guards/lib/tile-files.mjs'

/**
 * TILE LABEL OVER A PHOTOGRAPH, 20 September 2026.
 *
 * The heroes were fixed on 19 September and the identical defect was live one
 * component family along: thirteen tile captions each carrying their own wash,
 * every stop a percentage of the TILE, while the label is bottom-anchored and
 * hugs its own content. Driven with
 * `scripts/verify/hero-text-over-photograph-drive.mjs`, 149 runs sat below their
 * WCAG 2.2 SC 1.4.3 floor: /cities 86, /communities 49, /waitlist 12,
 * /city/sydney 2. Brisbane measured 1.00:1 on a white sky with 100 per cent of
 * its 464 core pixels failing, at 390, while the SAME gradient passed at 1440 -
 * which is the proof that the fault was the anchoring and not the strength.
 *
 * These cases hold the three things that make the replacement a guarantee: the
 * strength is enough for what the captions actually paint, the geometry does not
 * depend on how tall the label happens to be, and every tile uses it.
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
const NORMAL_TEXT_FLOOR = 4.5
const NAVY = [10, 22, 40]
/** Under a label, the worst thing a photograph can be is white. */
const WORST_PHOTOGRAPH = [255, 255, 255]
const over = (fg: number[], alpha: number, bg: number[]) => fg.map((c, i) => alpha * c + (1 - alpha) * bg[i])

const globals = () => readFileSync('src/app/globals.css', 'utf8')
const tokenFromGlobals = (name: string) => {
  const m = globals().match(new RegExp(`--color-${name}:\\s*#([0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`globals.css no longer declares --color-${name}`)
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
}

describe('the tile caption wash is strong enough for what the tiles paint', () => {
  it('is the SAME floor as the hero caption, imported rather than restated', () => {
    /*
     * The requirement is one piece of arithmetic about one pair of colours, and
     * both families paint the same worst foregrounds. Two copies of it is two
     * things to drift, and the drift is invisible until somebody measures a
     * photograph. The module must therefore import the number, not agree with it.
     */
    expect(TILE_CAPTION_MIN_ALPHA).toBe(HERO_CAPTION_MIN_ALPHA)
    const src = readFileSync('src/components/media/tile-photo-scrim.ts', 'utf8')
    expect(src).toMatch(/TILE_CAPTION_MIN_ALPHA\s*=\s*HERO_CAPTION_MIN_ALPHA/)
    expect(src).not.toMatch(/TILE_CAPTION_MIN_ALPHA\s*=\s*[0-9.]+/)
  })

  it('clears 4.5:1 for white on the worst photograph a tile can carry', () => {
    const bg = over(NAVY, TILE_CAPTION_MIN_ALPHA, WORST_PHOTOGRAPH)
    expect(contrast([255, 255, 255], bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_FLOOR)
  })

  it('clears 4.5:1 for gold-400, which is the most demanding thing a caption paints', () => {
    /* The event bento paints its date line in gold-400 over the same wash, and
     * gold needs more navy under it than white does. */
    const bg = over(NAVY, TILE_CAPTION_MIN_ALPHA, WORST_PHOTOGRAPH)
    expect(contrast(tokenFromGlobals('gold-400'), bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_FLOOR)
  })

  it('clears 4.5:1 for the FAINTEST white any caption paints, resolved from the call sites', () => {
    /*
     * Not a number typed here. Every `text-white/NN` inside a `<TileCaption>` is
     * read out of the tree, the faintest one wins, and it is composited over the
     * wash exactly as the browser composites it: a translucent foreground has no
     * painted colour of its own, so what lands on the page is the blend.
     */
    const alphas: number[] = [1]
    for (const file of allTsxFiles()) {
      if (!rendersTileCaption(file)) continue
      const src = readFileSync(file, 'utf8')
      for (const block of src.split('<TileCaption').slice(1)) {
        const body = block.split('</TileCaption>')[0]
        for (const m of body.matchAll(/\btext-white\/(\d{1,3})\b/g)) alphas.push(Number(m[1]) / 100)
      }
    }
    const faintest = Math.min(...alphas)
    expect(faintest).toBeLessThan(1) // the captions do paint translucent white
    const bg = over(NAVY, TILE_CAPTION_MIN_ALPHA, WORST_PHOTOGRAPH)
    expect(contrast(over([255, 255, 255], faintest, bg), bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_FLOOR)
  })
})

describe('the geometry is what makes the strength a promise', () => {
  it('declares every stop as an absolute LENGTH, never a percentage of the tile', () => {
    /*
     * THIS IS THE DEFECT ITSELF. `rgba(10,22,40,0) 35%, 0.55 70%, 0.92 100%` is
     * the shape thirteen tiles shipped, and a percentage of a box cannot say
     * anything about a label that is bottom-anchored and hugs its own content.
     */
    expect(TILE_CAPTION_SCRIM).not.toMatch(/\d+%/)
    expect(TILE_CAPTION_FADE).toMatch(/rem$/)
    expect(TILE_CAPTION_DEEPEN).toMatch(/rem$/)
  })

  it('reaches the floor BY the first line rather than at it', () => {
    const atFade = new RegExp(`rgba\\(10,22,40,${TILE_CAPTION_MIN_ALPHA}\\) ${TILE_CAPTION_FADE}`)
    expect(TILE_CAPTION_SCRIM).toMatch(atFade)
    expect(TILE_CAPTION_SCRIM).toMatch(/^linear-gradient\(to bottom, rgba\(10,22,40,0\) 0,/)
  })

  it('settles no lighter than the floor it promised', () => {
    expect(TILE_CAPTION_BASE_ALPHA).toBeGreaterThanOrEqual(TILE_CAPTION_MIN_ALPHA)
  })

  it('fades over a shorter distance than a hero, because a tile is 108px and a hero is 400', () => {
    const rem = (v: string) => Number(v.replace('rem', ''))
    expect(rem(TILE_CAPTION_FADE)).toBeLessThan(rem(HERO_CAPTION_FADE))
  })

  it('caps how much of a tile a caption may take before its lines belong below the image', () => {
    /* Two thirds is inherited: six tiles in this family declared `h-2/3` for
     * their wash band before any of this was measured. */
    expect(TILE_CAPTION_MAX_SHARE).toBeCloseTo(2 / 3, 5)
  })

  it('anchors itself, so no caller can move a label off the wash computed for it', () => {
    const component = readFileSync('src/components/media/tile-caption.tsx', 'utf8')
    expect(component).toMatch(/absolute inset-x-0 bottom-0/)
    for (const file of allTsxFiles()) {
      if (!rendersTileCaption(file)) continue
      for (const cls of tileCaptionClassNames(file) as string[]) {
        expect(cls, `${file} repositions <TileCaption>`).not.toMatch(/\babsolute\b|\bfixed\b|\binset-|\bbottom-/)
      }
    }
  })
})

describe('every tile label is on it, and the derivation is performed rather than claimed', () => {
  it('derives its painters from the media directory and finds a plausible number of them', () => {
    /*
     * The hero derivation could not see any of these, because a tile photograph
     * is painted by a different set of components. Deriving the set from the one
     * directory the media architecture allows is what stops a new one being
     * invisible until somebody measures it.
     */
    const painters = deriveTilePainters() as string[]
    expect(painters.length).toBeGreaterThanOrEqual(5)
    expect(painters).toContain('CityTileImage')
    expect(painters).toContain('CategoryTileImage')
    expect(painters).toContain('EventCardMedia')
    /* The full-bleed painters belong to the hero guard; two guards judging one
     * file is two places to disagree. */
    expect(painters).not.toContain('HeroMedia')
  })

  it('finds NO label painted on a tile photograph outside the shared caption', () => {
    const offenders = deriveTileLabelSurfaces() as Array<{ file: string; labels: unknown[] }>
    expect(offenders.map(o => o.file)).toEqual([])
  })

  it('finds no file that uses the shared caption AND writes a wash of its own', () => {
    const doubles = allTsxFiles().filter((f: string) => rendersTileCaption(f) && paintsOwnTileWash(f))
    expect(doubles).toEqual([])
  })

  it('still has tiles to judge, so a green result cannot mean the derivation went blind', () => {
    /*
     * A sweep that is missing a family does not look any different from a sweep
     * that is green. Thirteen files render `<TileCaption>` today; well under
     * that means something was renamed and every case above passed on nothing.
     */
    const users = allTsxFiles().filter((f: string) => rendersTileCaption(f))
    expect(users.length).toBeGreaterThanOrEqual(10)
  })
})
