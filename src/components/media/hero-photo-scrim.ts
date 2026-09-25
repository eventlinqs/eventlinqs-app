/**
 * THE TWO HERO SCRIMS, AND WHY A PERCENTAGE COULD NEVER HAVE WORKED.
 *
 * Every hero on this platform paints text on top of a photograph. Until
 * 19 September 2026 four templates each carried their own hand-written navy
 * gradient to keep that text readable, and the four disagreed with each other:
 *
 *   PhotographicCategoryHero    0.55@0%  0.18@12%  0.35@45%  0.85@100%
 *   PhotographicCityHero        0.55@0%  0.20@12%  0.65@45%  0.92@100%
 *   PhotographicCommunityHero   0.36@0%  0.12@20%  0.42@52%  0.90@100%
 *   city-hero.tsx               0.36@0%  0.12@20%  0.42@52%  0.88@100%
 *
 * globals.css has said "one curve for every hero" since the house grade landed,
 * and `src/components/features/home/hero-scrim.ts` calls itself THE ONE HERO
 * SCRIM. Neither was true: the one scrim was one only on the homepage.
 *
 * THE DEFECT THAT DIVERGENCE HID. Every stop above is a percentage of the hero
 * BAND, and the text is not positioned as a percentage of the band. It is
 * bottom-anchored and it hugs its own content, so the height it starts at moves
 * with the headline's length, the subtitle's wrap and the viewport. Measured on
 * 19 September 2026 with `scripts/verify/hero-text-over-photograph-drive.mjs`,
 * which hides each run and reads the pixels revealed behind it, the gold eyebrow
 * on /categories/technology scored
 *
 *     390    1.38:1   on #A9A09A      (floor 4.5)
 *     768    3.33:1   on #685E65
 *     1440  10.67:1   on #0A0810      passing
 *
 * on ONE page, ONE photograph, three widths. Nothing about the page was wrong at
 * 1440 and nothing was right at 390: the text had simply moved up into a part of
 * the picture the percentage had never been asked about. A scrim that fades by
 * band height cannot make a promise about text it cannot locate.
 *
 * SO THE SCRIM IS ANCHORED TO THE TEXT, NOT TO THE BAND. `HERO_CAPTION_SCRIM`
 * is painted by an element that starts a fixed `HERO_CAPTION_FADE` above the
 * caption's own top edge and runs to the foot of the band. Its stops are
 * ABSOLUTE LENGTHS, not percentages, so the fade occupies exactly that bleed and
 * every pixel from the caption's first line downward carries at least
 * `HERO_CAPTION_MIN_ALPHA`, at every viewport, for any headline of any length.
 * The guarantee stops depending on layout, which is the whole point.
 *
 * WHERE 0.82 COMES FROM. It is not taste. The constitution fixes the eyebrow's
 * colour ("a GOLD eyebrow, --brand-accent on the dark hero, never a white
 * eyebrow"), so the only free variable is the surface under it. gold-400
 * (#E8B738) needs a background no lighter than a navy wash of alpha 0.760 to
 * hold WCAG 2.2 SC 1.4.3's 4.5:1 against the worst photograph a hero can ever
 * carry, which is a white one. 0.82 is that requirement with headroom for the
 * house grade, which lifts highlights by saturate(1.06) contrast(1.03) after the
 * figure is computed. `scripts/guards/hero-text-over-a-photograph.mjs`
 * RECOMPUTES the requirement from the gold token and fails the build if this
 * number ever stops covering it, so neither value can drift alone.
 *
 * WHY THE HEADER SCRIM IS STILL SEPARATE. It answers a different question and is
 * the one thing a percentage CAN answer: the transparent header is pinned to the
 * top of the band, so a top-anchored wash always finds it. It stays its own
 * layer rather than being folded in.
 *
 * WHAT THIS IS NOT. It is not a flat painted dark surface, which the design
 * system bans: the darkness comes from a photograph plus a navy overlay, which
 * is the sanctioned hero pattern, and above the caption the photograph is now
 * CLEARER than it was, because the mid-band wash the four templates used to
 * carry is gone.
 */

/** Navy, the only colour any hero wash is permitted to be. */
const NAVY = '10,22,40'

/**
 * How far above the caption's own top edge the wash begins, so it arrives at
 * full strength by the first line of text rather than at it. A length, never a
 * percentage: that is what makes the promise below independent of layout.
 */
export const HERO_CAPTION_FADE = '2.75rem'

/**
 * The floor the caption wash holds from the caption's top edge downward.
 * Every hero's text sits on at least this much navy, whatever the photograph.
 */
export const HERO_CAPTION_MIN_ALPHA = 0.82

/** The wash the foot of the band settles to, as the shipped heroes already did. */
export const HERO_CAPTION_BASE_ALPHA = 0.9

/**
 * How far below the caption's top edge the wash finishes deepening to
 * `HERO_CAPTION_BASE_ALPHA`.
 *
 * IT IS A LENGTH FOR THE SAME REASON THE FADE IS. `100%` was written here
 * first, and `100%` of an element that deliberately bleeds past the foot of the
 * band puts the deepening somewhere nobody can see, leaving the visible wash
 * short of the base it claims to reach. Both ends of this ramp are absolute, so
 * the whole curve is complete within the caption whatever the element's height.
 */
export const HERO_CAPTION_DEEPEN = '14rem'

/**
 * The caption wash. Anchored to the text: transparent above it, at
 * `HERO_CAPTION_MIN_ALPHA` by its first line, settling to the base below.
 */
export const HERO_CAPTION_SCRIM =
  `linear-gradient(to bottom, rgba(${NAVY},0) 0, rgba(${NAVY},${HERO_CAPTION_MIN_ALPHA}) ${HERO_CAPTION_FADE}, rgba(${NAVY},${HERO_CAPTION_BASE_ALPHA}) ${HERO_CAPTION_DEEPEN})`

/**
 * The header wash. Top-anchored, so the transparent header's white nav clears a
 * bright sky band.
 *
 * THE STRONGER OF THE TWO SHIPPED VALUES IS TAKEN, DELIBERATELY. The four
 * templates ran two shapes: 0.55 falling to 0.20 by 12 per cent, and 0.36
 * falling to 0.12 by 20 per cent. The lighter one was tried here first and is
 * wrong, because the heavier one is not an accident: PhotographicCityHero
 * records it as a "Fix from Batch 11.0 founder review" made for exactly this
 * job. Unifying downward would have quietly undone a fix somebody had already
 * had to make, which is the shape of regression Law 9 is about. The first 12
 * per cent is therefore identical to the reviewed value, and only the release
 * afterwards is new.
 */
export const HERO_HEADER_SCRIM =
  `linear-gradient(to bottom, rgba(${NAVY},0.55) 0%, rgba(${NAVY},0.2) 12%, rgba(${NAVY},0) 22%)`

/**
 * The navy field a hero falls back to when it has no photograph at all. Three
 * of the four templates declared this identically; the fourth did not have one.
 */
export const HERO_NO_PHOTO_FIELD =
  `linear-gradient(135deg, rgb(${NAVY}) 0%, rgb(20,32,56) 50%, rgb(${NAVY}) 100%)`
