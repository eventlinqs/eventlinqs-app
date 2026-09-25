/**
 * THE TILE CAPTION SCRIM, AND WHY THE HERO FIX HAD TO BE MADE TWICE.
 *
 * `./hero-photo-scrim.ts` records, at length, why a wash whose stops are
 * PERCENTAGES OF THE BAND cannot make a promise about text it cannot locate.
 * That file ended the defect for heroes on 20 September 2026. It ended it for
 * heroes only. One component family along, thirteen tile captions were painting
 * white text on a photograph under exactly the same shape, and three of them
 * were near-identical hand-written copies of each other:
 *
 *   src/app/cities/page.tsx          rgba(10,22,40,0) 35%  0.55 70%  0.92 100%
 *   src/app/communities/page.tsx     rgba(10,22,40,0) 35%  0.55 70%  0.92 100%
 *   waitlist-client.tsx              rgba(10,22,40,0) 40%  0.55 72%  0.92 100%
 *   six more, in BLACK rather than navy, at 0.78 or 0.82 over the bottom 2/3
 *
 * MEASURED ON 20 SEPTEMBER 2026 by `scripts/verify/hero-text-over-photograph-drive.mjs`,
 * which hides each text run and reads the pixels revealed behind it. 149 runs
 * below their WCAG 2.2 SC 1.4.3 floor: /cities 86, /communities 49, /waitlist
 * 12, /city/sydney 2. The worst of them:
 *
 *   Brisbane   1.00:1 on #FFFFFD   100.0% of 464 core pixels below floor
 *   Hobart     1.20:1 on #DEECFF   100.0% of 337
 *   Newcastle  1.25:1 on #E4E6EE   100.0% of 536
 *
 * A TILE IS A HARDER CASE THAN A HERO, AND THE MEASUREMENT SAYS SO. On /cities
 * at 390 the tile is 173x108 and its caption - city name, state line and an
 * event-count pill - measures 112px TALL. The caption is bigger than the tile
 * it is anchored to, so the city name is painted at the very top of the
 * picture, which is exactly where the percentage ramp has not started. That is
 * the whole of the Brisbane result: nothing about the gradient was wrong at
 * 1440, where the same caption sits at 36 per cent of a 201px tile.
 *
 * SO THE FIX IS NOT "MAKE THE GRADIENT DARKER", and the proof of that is in the
 * data rather than in an argument: /waitlist passes at 768 and fails at 390
 * with the identical gradient. The wash is anchored to the LABEL in absolute
 * lengths, so every pixel from the caption's first line downward carries at
 * least `TILE_CAPTION_MIN_ALPHA` at every viewport, for any label of any
 * length.
 *
 * AND A SECOND RULE THE HEROES DID NOT NEED: A CAPTION MUST FIT ITS TILE.
 * Anchoring alone would have covered 100 per cent of that 108px tile in navy,
 * which trades a contrast defect for an image-poor one and Law 4 forbids that
 * just as clearly. `TILE_CAPTION_MAX_SHARE` is the ceiling, and the surfaces
 * that breached it moved their secondary lines OFF the photograph and into the
 * card body below it, which is what the design system asks for in the first
 * place: "Image alone, all details below the image ... the single allowed
 * on-photo overlay is a place name on a darkened-gradient band on city/venue
 * tiles, one line of identity only."
 */
import { HERO_CAPTION_BASE_ALPHA, HERO_CAPTION_MIN_ALPHA } from './hero-photo-scrim'

/** Navy, the only colour any wash on this platform is permitted to be. */
const NAVY = '10,22,40'

/**
 * The floor a tile caption holds from its own top edge downward.
 *
 * IT IS IMPORTED, NOT RESTATED, AND THAT IS THE POINT. The requirement is
 * arithmetic about the worst foreground painted over the worst photograph, and
 * both families paint the same two: gold-400, which needs a navy wash of alpha
 * 0.760 to hold 4.5:1 over a white picture, and white at 70 per cent opacity,
 * which needs 0.720. One number therefore governs both, and a second copy of it
 * here is a second thing to drift. `scripts/guards/tile-label-over-a-photograph.mjs`
 * fails the build if this file ever states a literal instead of importing one.
 */
export const TILE_CAPTION_MIN_ALPHA = HERO_CAPTION_MIN_ALPHA

/** The wash the foot of the tile settles to, as the shipped tiles already did. */
export const TILE_CAPTION_BASE_ALPHA = HERO_CAPTION_BASE_ALPHA

/**
 * How far above the caption's own top edge the wash begins.
 *
 * WHY IT IS NOT THE HERO'S 2.75rem. A hero band is 400px at its shortest and a
 * 44px fade is a tenth of it. The smallest tile in this family is 108px, where
 * the same fade is 41 per cent of the whole picture, and the bleed would be the
 * thing a reader noticed. 24px is 22 per cent of that tile and 8 per cent of the
 * largest one the family renders (318px on /communities at 1440), which reads as
 * a band on both.
 */
export const TILE_CAPTION_FADE = '1.5rem'

/**
 * How far below the caption's top edge the wash finishes deepening to
 * `TILE_CAPTION_BASE_ALPHA`. Absolute for the same reason the fade is: a
 * percentage of an element that deliberately bleeds past the foot of the tile
 * puts the deepening somewhere nobody can see.
 */
export const TILE_CAPTION_DEEPEN = '6rem'

/**
 * The most of a tile its caption and fade may occupy before the caption is too
 * tall for the tile and its secondary lines belong below the image.
 *
 * TWO THIRDS IS INHERITED, NOT CHOSEN. Six tiles in this family already
 * declared `h-2/3` for their wash band before any of this was measured, so the
 * platform had already answered "how much of a tile may be darkened" and the
 * answer is written in its own markup. `scripts/verify/tile-caption-fit-drive.mjs`
 * measures the rendered caption against it at 390, 768 and 1440.
 */
export const TILE_CAPTION_MAX_SHARE = 2 / 3

/**
 * The tile caption wash. Anchored to the label: transparent above it, at
 * `TILE_CAPTION_MIN_ALPHA` by its first line, settling to the base below.
 */
export const TILE_CAPTION_SCRIM =
  `linear-gradient(to bottom, rgba(${NAVY},0) 0, rgba(${NAVY},${TILE_CAPTION_MIN_ALPHA}) ${TILE_CAPTION_FADE}, rgba(${NAVY},${TILE_CAPTION_BASE_ALPHA}) ${TILE_CAPTION_DEEPEN})`
