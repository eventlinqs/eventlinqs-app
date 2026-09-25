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
/*
 * The one derivation, read here exactly as the guard and the drive read it.
 * A `.mjs` under scripts/ is deliberate: this is the same module the build-time
 * guard loads, so the suite cannot agree with a second copy of the rules.
 */
import {
  NOT_YET_ON_THE_SHARED_WASH as REGISTER,
  allSourceFiles,
  derivePhotographicTextSurfaces,
  gradientWashAlphas,
  paintsOwnWash,
} from '../../../scripts/guards/lib/hero-files.mjs'

/** Every file that paints text over a photograph, as paths. */
const deriveSurfaces = () => derivePhotographicTextSurfaces().map(x => x.file)

const NOT_YET_ON_THE_SHARED_WASH: string[] = (REGISTER as Array<{ file: string }>).map(e => e.file)

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

/*
 * THE LIST THAT USED TO STAND HERE WAS THE THIRD COPY OF ONE MISTAKE.
 *
 * This block named the same five files the guard named, and the drive's own
 * coverage table named four of them. All three claimed to cover "every hero
 * that paints text on a photograph"; all three were typed by hand; and on
 * 20 September 2026 the derivation was performed for the first time and
 * returned THIRTEEN. The eight nobody had listed each carried their own navy
 * gradient, and driving them measured 34 runs below their WCAG 2.2 SC 1.4.3
 * floor, the worst a gold eyebrow at 1.01:1 on /waitlist with 100 per cent of
 * its pixels failing.
 *
 * So the set is now DERIVED, in one place, by scripts/guards/lib/hero-files.mjs,
 * and the guard, the drive and this suite all read that one function. Adding a
 * hero cannot leave any of the three behind.
 */
describe('every surface that paints text on a photograph', () => {
  const HEROES = deriveSurfaces()
  const registered = new Set(NOT_YET_ON_THE_SHARED_WASH)
  const held = HEROES.filter(f => !registered.has(f))

  it('derives the heroes rather than trusting a list, and finds every family', () => {
    // A derivation that quietly returns three files is worse than no
    // derivation, so the count is asserted against what the platform has.
    expect(HEROES.length).toBeGreaterThanOrEqual(19)
    for (const known of [
      'src/components/templates/PhotographicCategoryHero.tsx',
      'src/components/features/city/city-hero.tsx',
      'src/app/events/[slug]/page.tsx',
      'src/components/features/home/FeaturedHeroClient.tsx',
      'src/app/waitlist/page.tsx',
      // The five the hero-scale derivation could never see, because none of
      // them is a hero and none carries the locked scale token. The auth panel
      // is the one that was measured at 1.00:1 on every sign-in page.
      'src/components/auth/auth-shell.tsx',
      'src/components/features/venues/venue-profile-hero.tsx',
      'src/components/marketplace/marketplace-hero.tsx',
      'src/app/queue/[slug]/queue-room.tsx',
      'src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx',
    ]) {
      expect(HEROES).toContain(known)
    }
    /*
     * A SKELETON CARRIES THE HERO SCALE AND PAINTS NO PHOTOGRAPH, so there is
     * nothing for a wash to protect and it is excluded by the second mark
     * rather than by name.
     *
     * This used to assert it on `src/app/events/[slug]/loading.tsx`, which was
     * deleted under close-out C8 (a loading boundary in front of a hero costs
     * the LCP; see no-loading-boundary-in-front-of-a-hero.mjs). An assertion
     * that a DELETED file is absent passes for the wrong reason and proves
     * nothing about the derivation, so it is re-aimed at a skeleton that is
     * still in the tree.
     */
    expect(HEROES).not.toContain('src/components/ui/LoadingState.tsx')
  })

  it.each(held)('%s writes no wash of its own', file => {
    // A wash is any TRANSLUCENT DARK gradient, not one particular triple: the
    // assertion used to name rgba(10,22,40), and the auth panel washed its
    // photograph in rgba(10,14,26), which is not the brand navy and would have
    // satisfied the old form. ONE implementation, shared with the guard,
    // because the first copy of this arithmetic written here had a nesting bug
    // that made it match nothing at all.
    const alphas = gradientWashAlphas(readFileSync(file, 'utf8'))
    expect(alphas, `${file} paints its own wash at alpha ${alphas.join(', ')}`).toEqual([])
  })

  it('the wash detector reads a real gradient, whose stops are themselves function calls', () => {
    // The regression this pins: a non-greedy body stopped at the FIRST close
    // paren, which belongs to the rgba, so no complete stop was ever inside it
    // and the clause matched nothing on any file. A drill firing a violation at
    // a live guard is what found it.
    expect(
      paintsOwnWash('background: linear-gradient(180deg, rgba(10,22,40,0.36) 0%, rgba(10,22,40,0.88) 100%)'),
    ).toBe(true)
    // Gold is decoration, not a wash: FeaturedHeroClient paints an indicator ramp.
    expect(paintsOwnWash('linear-gradient(90deg, rgba(232,183,56,0) 0%, rgba(232,183,56,0.7) 86%)')).toBe(false)
    // Opaque is a field, not a wash: three heroes declare the no-photo navy.
    expect(paintsOwnWash('linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%)')).toBe(false)
    // A comment quoting the gradient somebody DELETED is a record, not a wash.
    expect(paintsOwnWash('/* was: linear-gradient(180deg, rgba(10,22,40,0.55) 0%) */')).toBe(false)
  })

  it.each(held)('%s puts its text inside <HeroCaption>', file => {
    // The opening tag, not the identifier: an unused import would satisfy that.
    expect(readFileSync(file, 'utf8')).toMatch(/<HeroCaption[\s>]/)
  })

  it.each(held)('%s clips its band, which is what trims the full-width bleed', file => {
    expect(readFileSync(file, 'utf8')).toContain('overflow-hidden')
  })

  /*
   * `.hero-enter` staggers its DIRECT children (globals.css:
   * `html[data-motion="1"] .hero-enter > *`), and <HeroCaption> puts two
   * elements between its own className and the text. A stagger written on
   * `className` therefore animates the wash as item one and the whole text
   * block as item two, so the eyebrow, headline, meta and CTA arrive together
   * instead of 70ms apart: the Motion law's hero entrance, quietly deleted.
   *
   * NOTHING DRIVEN CAN CATCH IT. The stagger arms only under
   * `data-motion="1"`, which headless agents are deliberately never given, so
   * every screenshot and every contrast sweep shows the correct settled frame.
   * It was a real mistake made while converting these heroes on 20 September
   * 2026, and reading the stylesheet is what found it.
   */
  it.each(held)('%s staggers the text itself, not the wash above it', file => {
    const src = readFileSync(file, 'utf8')
    for (const tag of src.matchAll(/<HeroCaption\b[\s\S]*?>/g)) {
      const outer = tag[0].match(/(?<!content)className=(?:"([^"]*)"|\{`([^`]*)`\})/)
      const value = outer ? (outer[1] ?? outer[2] ?? '') : ''
      expect(value).not.toMatch(/\bhero-enter\b/)
      expect(value).not.toMatch(/\bhero-slide-content\b/)
    }
  })
})

/*
 * THE RATCHET. Nine surfaces are not yet on the shared wash. Three sit behind
 * the lane border (lane B's organiser marketing surfaces, measured and recorded
 * in REVIEW-QUEUE-C.md); the other six each state a condition that this test
 * and the guard both re-evaluate. The register is allowed to shrink and nothing
 * else.
 *
 * WHY THE NUMBER WENT 4 -> 6 ON 20 SEPTEMBER 2026, because a rising ratchet
 * count is exactly what this test exists to make somebody justify. No debt was
 * added. The SUBJECT SET widened: the derivation stopped keying on the locked
 * hero scale, which the constitution itself carves two exceptions out of, and
 * went from 13 files to 19. Six files were invisible to every check on the
 * platform until that day, and the two worst of them were FIXED rather than
 * registered: the auth panel, whose wordmark measured 1.00:1 on every sign-in
 * page, and the /about story band at 3.80:1. Three more were CONVERTED to the
 * shared wash in the same pass and are not in the register at all. What is
 * registered is only what genuinely cannot or should not be converted, and both
 * new entries carry a `stillTrue` the guard runs on every build.
 *
 * IT WAS BRIEFLY 9. Three of those were false positives of a derivation that
 * climbed past a photograph's own flow box, and they were answered by fixing
 * the climb rather than by writing three excuses.
 */
describe('the heroes not yet on the shared wash', () => {
  it('is a debt that only ever shrinks: nothing may be added to it here', () => {
    // The number is asserted so that adding an entry fails this test and has to
    // be argued for, rather than appearing in a diff as one more line.
    expect(NOT_YET_ON_THE_SHARED_WASH).toHaveLength(6)
  })

  it('every entry that is not a lane border states a condition the guard re-evaluates', () => {
    // An entry with no `stillTrue` is a sentence. An entry with one is a claim
    // that fails the build the day it stops being true. Only a border - work
    // this lane is forbidden to do - is allowed to be the former.
    const withoutCondition = REGISTER.filter(e => !e.stillTrue && !/^B /.test(e.lane))
    expect(withoutCondition.map(e => e.file)).toEqual([])
  })

  it.each(NOT_YET_ON_THE_SHARED_WASH)('%s is still a hero, so the entry still means something', file => {
    expect(deriveSurfaces()).toContain(file)
  })

  it.each(NOT_YET_ON_THE_SHARED_WASH)('%s has not already been converted, which would make its entry stale', file => {
    const src = readFileSync(file, 'utf8')
    const converted = !paintsOwnWash(src) && /<HeroCaption[\s>]/.test(src)
    expect(converted).toBe(false)
  })

  it('the shared empty state is registered only while its photographic branch has no caller', () => {
    // `onPhoto` is `!!coverImage`. The day a caller passes one, that branch
    // ships a 0.42 navy wash under a headline and the entry stops being true.
    const callers = allSourceFiles().filter(
      f => !f.endsWith('src/components/ui/CategoryHeroEmpty.tsx') && readFileSync(f, 'utf8').includes('<CategoryHeroEmpty'),
    )
    expect(callers.length).toBeGreaterThanOrEqual(10)
    for (const f of callers) {
      for (const call of readFileSync(f, 'utf8').matchAll(/<CategoryHeroEmpty\b[^>]*>/g)) {
        expect(call[0]).not.toMatch(/\bcoverImage\s*=/)
      }
    }
  })
})
