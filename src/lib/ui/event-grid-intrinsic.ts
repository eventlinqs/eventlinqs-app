/**
 * The height an "all events" grid section WILL be, derived from the number of
 * cards it holds, so `content-visibility: auto` can reserve the right space.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026. Nine interior
 * templates skip below-fold layout with `cv-section`, whose reservation is
 * `auto 480px` - the rail step, a heading and one row of cards. FOUR sections
 * were excluded from it by measurement, and they are the largest single layout
 * cost left on their pages:
 *
 *     /city/[slug]            "All <city> events"          9,067px at 390
 *     /categories/[slug]      "Live <category> events"     9,043px at 390
 *     /city/[slug]/[suburb]   "All <suburb> events"        3,535px at 390
 *     /community/[c]/[city]   "All <c> events in <city>"   same markup as the city page
 *
 * 480px on a 9,067px section is wrong by 1,789%, and reserving it anyway grew
 * /city/melbourne from 7,551px to 12,055px as it was scrolled. That attempt
 * was measured and reverted; the instrument that caught it is
 * scripts/verify/below-fold-sections-drive.mjs.
 *
 * BUT THE HEIGHT IS NOT UNKNOWABLE. It is `n` cards in 1, 2 or 3 columns, and
 * a card is a media box of fixed aspect over a body of fixed height. Every
 * term is known at render time except the viewport width, and CSS can carry
 * that term itself. So the section declares its own height instead of
 * inheriting a rail's.
 *
 * ============================================================================
 * EVERY CONSTANT BELOW WAS MEASURED, NOT DERIVED FROM THE TYPE SCALE
 * ============================================================================
 *
 * Read off the production build on 19 September 2026 by
 * `scripts/verify/event-grid-intrinsic-drive.mjs --derive`, on /city/melbourne,
 * /categories/music and /city/melbourne/inner-melbourne at 390, 768 and 1440.
 * Re-derive them with the same command rather than editing them by eye.
 *
 * The formula reproduces the three measured sections to within a pixel. The
 * measured column is the section's CONTENT box - its border box less its
 * padding - because that is the box `contain-intrinsic-size` sizes:
 *
 *     /city/melbourne          390  predicted 8,938    measured 8,938.8
 *                              768  predicted 5,196    measured 5,196.4
 *                             1440  predicted 3,972    measured 3,972.3
 *     .../inner-melbourne      390  predicted 3,406.75 measured 3,407
 *                              768  predicted 2,200    measured 2,200.2
 *                             1440  predicted 1,527    measured 1,527.1
 *
 * ============================================================================
 * THE THREE THINGS IT CANNOT KNOW, STATED SO NOBODY IS SURPRISED
 * ============================================================================
 *
 * 1. A TITLE THAT DOES NOT WRAP. `event-card-title` is `line-clamp-2`, and a
 *    grid row is as tall as the tallest card in it. On all three pages
 *    measured, every row came back at exactly 144.5px of card body, so every
 *    row holds at least one two-line title. A grid whose titles are all short
 *    is one line of 18px/1.375 text shorter per row - 24.75px on a row of
 *    344.75 to 465px, which is 5.3% to 7.2%. That is why the drive's budget is
 *    10% rather than a pixel count.
 *
 * 2. THE CATEGORY PAGE'S HEADING BLOCK. Three of the four templates render the
 *    same eyebrow-plus-heading block; /categories/[slug] renders a heading
 *    alone with `mb-8`. Measured, its heading block is 88/92/92 against the
 *    112/84/84 below, so the estimate is 0.26% long at 390 and 0.16% and 0.20%
 *    short at 768 and 1440. Carrying two chrome profiles to recover a quarter
 *    of one per cent would be precision theatre.
 *
 * 3. A CLASSIC SCROLLBAR. `100vw` includes it; the content box does not.
 *    Chromium's headless contexts use overlay scrollbars, so the drive
 *    measures documentWidth === viewportWidth at all three viewports and the
 *    estimate is exact there. A real Windows desktop Chrome takes about 15px,
 *    which at 1440 is absorbed entirely by the 1400px container cap and at 768
 *    costs about 2.5% of the section. Inside the budget, and named here rather
 *    than discovered later.
 */

/** The bands the four grids change shape at. Tailwind `md:` and `lg:`. */
export type IntrinsicBand = 'base' | 'md' | 'lg'

/** One ROW COUNT per band, for `--cv-r-base`, `--cv-r-md` and `--cv-r-lg`. */
export type IntrinsicSize = Readonly<Record<IntrinsicBand, number>>

/**
 * The grid all four templates render:
 * `grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3`.
 * `scripts/guards/event-grid-reserves-its-own-height.mjs` fails the build if a
 * template's class string stops saying this.
 */
const COLUMNS: Readonly<Record<IntrinsicBand, number>> = { base: 1, md: 2, lg: 3 }

/** `gap-6`. */
const GAP_PX = 24

/** ContentSection's inner wrapper: `px-4 md:px-6 lg:px-8`. */
const WRAPPER_PAD_PX: Readonly<Record<IntrinsicBand, number>> = { base: 16, md: 24, lg: 32 }

/**
 * `max-w-7xl`, which `--container-7xl: 87.5rem` in globals.css overrides to
 * 1400px - the sitewide container width (Design system: Spacing and container).
 */
const CONTAINER_MAX_PX = 1400

/**
 * `event-card-media`: `aspect-video` below md, `md:aspect-[4/3]` from md.
 * The media box is the card's content box, so it is the column width less the
 * card's 1px border on each side.
 */
const MEDIA_RATIO: Readonly<Record<IntrinsicBand, number>> = { base: 9 / 16, md: 3 / 4, lg: 3 / 4 }

/** `event-card-surface`: `border` on all four sides. */
const CARD_BORDER_PX = 2

/**
 * The card below its media box: eyebrow, two-line title, meta row, price row
 * and the body padding, plus the two border edges.
 * MEASURED 144.5px at 390, 768 and 1440, identical at all three.
 */
const CARD_BODY_PX = 144.5

/**
 * The section's own content BESIDES the grid: the heading block, and nothing
 * else. MEASURED at 112/84/84 on /city/melbourne and
 * /city/melbourne/inner-melbourne. (84 rather than 112 from the `md` step
 * because the heading and the "Open in browse view" link stop wrapping onto
 * separate lines.)
 *
 * IT DOES NOT INCLUDE THE SECTION'S PADDING, and the first version of this
 * module did, which is the kind of error that passes every check aimed at it.
 * `contain-intrinsic-size` sizes the CONTENT BOX: the browser adds
 * `py-16 md:py-20 lg:py-24` on top of whatever is reserved here. Including it
 * made the skipped section 128px taller than the rendered one at 390 - proven
 * by reading the section's own box in both states on one build
 * (`event-grid-intrinsic-drive.mjs --drift`: first paint 16,370px reserved
 * against 16,242px laid out, a difference of exactly the padding).
 *
 * The check that MISSED it was this module's own drive, comparing the raw
 * reservation with the section's BORDER box - two different boxes, and they
 * agreed to 0.0% because the error was hidden inside the constant. It compares
 * reservation-plus-padding now.
 *
 * A consequence worth stating: the section's vertical padding may be retuned
 * freely without touching this module. It is not part of the reservation,
 * because the browser supplies it.
 */
const SECTION_CHROME_PX: Readonly<Record<IntrinsicBand, number>> = { base: 112, md: 84, lg: 84 }

const BANDS: readonly IntrinsicBand[] = ['base', 'md', 'lg']

/** Trim a computed ratio to something a stylesheet can be read by a person. */
function trim(n: number): string {
  return String(Math.round(n * 1e6) / 1e6)
}

/**
 * The rows a grid of `count` cards will have at each column band. These three
 * integers are the ONLY thing that crosses the wire.
 *
 * THAT IS A MEASUREMENT DECISION, NOT A TASTE ONE. The first version emitted
 * the whole `calc()` as three inline custom properties. Measured on the served
 * documents, that was 470 bytes each across its TWO copies - the markup and
 * the RSC flight payload - and 134 to 179 bytes gzipped, which is 0.50% of the
 * gzip of /categories/music, a page where the reservation is currently inert.
 * Three integers are 39 bytes per copy. The formula they are multiplied by is
 * identical on every page, so it belongs in the stylesheet, which is fetched
 * once and cached: `eventGridIntrinsicCss()` generates it from the constants
 * above and `scripts/guards/event-grid-reserves-its-own-height.mjs` fails the
 * build if globals.css stops matching it character for character.
 *
 * Returns `null` for an empty grid, which is not a failure: a section with no
 * events renders the shared designed empty state instead, whose height has
 * nothing to do with a card count. Those sections keep the 480px rail
 * reservation, and `null` is what tells `ContentSection` to fall back to it.
 *
 * WHAT THAT COSTS, measured rather than waved past. On
 * /community/african/melbourne, which holds no events, the empty-state section
 * renders at 679px, 807px and 816px at 390, 768 and 1440 against the 480px
 * reserved - about 200 to 340px of growth on a 7,000px page, so under 5%. It
 * is not computable the way a grid is: the headline carries the community and
 * city names and wraps differently on every intersection. Whoever wants that
 * last few per cent should measure a spread of intersections first, because a
 * constant taken from one page would be a guess wearing a measurement's
 * clothes.
 */
export function eventGridIntrinsicSize(count: number): IntrinsicSize | null {
  if (!Number.isFinite(count) || count < 1) return null
  const n = Math.floor(count)
  return Object.freeze({
    base: Math.ceil(n / COLUMNS.base),
    md: Math.ceil(n / COLUMNS.md),
    lg: Math.ceil(n / COLUMNS.lg),
  }) as IntrinsicSize
}

/**
 * The `contain-intrinsic-size` value `.cv-measured` declares for one band,
 * generated from the constants above so the stylesheet cannot drift from them.
 *
 * The arithmetic is rearranged so the row count is named ONCE:
 * `rows * rowHeight + (rows - 1) * gap + chrome` becomes
 * `rows * (rowHeight + gap) + (chrome - gap)`.
 *
 * THE FALLBACK IN `var(--cv-r-*, 1)` IS NOT DECORATION. A `calc()` holding an
 * undefined custom property is invalid at computed-value time, and an invalid
 * `contain-intrinsic-size` on a skipped element reserves NOTHING: the section
 * collapses to zero and the page jumps its whole length when it renders. One
 * row is the smallest honest answer to "how tall is a grid whose row count did
 * not arrive".
 */
export function eventGridIntrinsicCss(band: IntrinsicBand): string {
  const columns = COLUMNS[band]
  // Everything taken off the viewport before the columns are cut from it: the
  // wrapper's padding on both sides, and the gutters between columns.
  const inset = 2 * WRAPPER_PAD_PX[band] + (columns - 1) * GAP_PX
  const columnWidth =
    columns === 1
      ? `(min(100vw, ${CONTAINER_MAX_PX}px) - ${inset + CARD_BORDER_PX}px)`
      : `((min(100vw, ${CONTAINER_MAX_PX}px) - ${inset}px) / ${columns} - ${CARD_BORDER_PX}px)`
  const rowPlusGap = `(${columnWidth} * ${trim(MEDIA_RATIO[band])} + ${CARD_BODY_PX + GAP_PX}px)`
  return `calc(var(--cv-r-${band}, 1) * ${rowPlusGap} + ${SECTION_CHROME_PX[band] - GAP_PX}px)`
}

/**
 * The same arithmetic in numbers rather than CSS, for the unit tests and for
 * anything that needs to compare an estimate with a measurement. `viewport` is
 * the layout viewport width in px.
 */
export function eventGridIntrinsicPx(count: number, band: IntrinsicBand, viewport: number): number | null {
  if (!Number.isFinite(count) || count < 1) return null
  const n = Math.floor(count)
  const columns = COLUMNS[band]
  const rows = Math.ceil(n / columns)
  const inset = 2 * WRAPPER_PAD_PX[band] + (columns - 1) * GAP_PX
  const columnWidth = (Math.min(viewport, CONTAINER_MAX_PX) - inset) / columns
  const rowHeight = (columnWidth - CARD_BORDER_PX) * MEDIA_RATIO[band] + CARD_BODY_PX
  return rows * rowHeight + (rows - 1) * GAP_PX + SECTION_CHROME_PX[band]
}

/** The bands, the columns and the breakpoints, for the guard to read. */
export const EVENT_GRID_GEOMETRY = Object.freeze({
  bands: BANDS,
  columns: COLUMNS,
  gapPx: GAP_PX,
  wrapperPadPx: WRAPPER_PAD_PX,
  containerMaxPx: CONTAINER_MAX_PX,
  mediaRatio: MEDIA_RATIO,
  cardBorderPx: CARD_BORDER_PX,
  cardBodyPx: CARD_BODY_PX,
  sectionChromePx: SECTION_CHROME_PX,
  /** The class string the four templates must keep rendering. */
  gridClass: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3',
  /** The wrapper ContentSection puts around every section's children. */
  wrapperClass: 'px-4 md:px-6 lg:px-8',
  /** The media box's aspect classes on `event-card-media`. */
  mediaClass: 'aspect-video',
  mediaClassMd: 'md:aspect-[4/3]',
  /** The three custom properties a reserving section writes. */
  rowVars: BANDS.map(b => `--cv-r-${b}`),
})
