/**
 * Centralised `sizes` hints for next/image.
 *
 * `sizes` tells the browser which srcset candidate to download at which
 * viewport. Wrong hints = the image optimizer ships a 1920px asset for a
 * 300px tile (or vice versa). Components must reference these constants so
 * the same layout role gets the same hint everywhere on the platform.
 *
 * See docs/MEDIA-ARCHITECTURE.md §4.3 for policy.
 *
 * ============================================================================
 * ONE HINT PER LAYOUT, NOT PER COMPONENT. THE DIFFERENCE COST REAL BYTES.
 * ============================================================================
 *
 * The rule above was already written here and was still being broken, because
 * "the same layout role" was read as "the same component". Driven on this tree's
 * production build at nine viewports on 18 September 2026
 * (`C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt`), THREE hints were serving
 * THIRTEEN different layouts, and one string cannot be right for thirteen widths:
 *
 *   - `card` was worn by a 160px community tile, a 240px rail card, a 420px
 *     feature card and a results grid at once. On the homepage at 1440 it made
 *     the browser fetch a 1080px-wide image for a 278px slot, and at a 1920px
 *     desktop a 1920px-wide image for the same slot: x6.9.
 *   - `rail` was worn by a 150px scene tile AND a 340px city tile. Too big for
 *     one and TOO SMALL for the other, so the city tiles on the homepage and on
 *     /cities fetched 640px for a slot needing 644 and rendered BLURRY on any 2x
 *     screen. An over-generous hint wastes bytes; a mean one breaks the premium
 *     bar, which is the worse of the two.
 *   - `card` also claimed the grid went two-up at 640, and eight templates go
 *     two-up at 768 (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`). Every event
 *     card between 640 and 767 CSS pixels wide was fetched at HALF the width it
 *     rendered at.
 *
 * ============================================================================
 * HOW TO READ A HINT HERE, AND THE ONE RULE FOR WRITING A NEW ONE
 * ============================================================================
 *
 * A hint describes LAYOUT, so it is written from the layout, never from a
 * measurement that happened to be taken at three viewports.
 *
 *   - A RAIL CELL is a fixed pixel width that steps once at Tailwind's `sm`
 *     (640px), so its hint is the two numbers out of `src/lib/ui/rhythm.ts` and
 *     nothing else. `scripts/guards/image-hints-match-the-cell.mjs` compares the
 *     two and fails the build if either moves without the other.
 *   - A GRID is viewport-relative UNTIL the container stops growing. Every
 *     content column on this platform is capped at `max-w-7xl`, which is 1400px
 *     INCLUDING its 32px of large-screen padding, so 1336px of content. Above
 *     that a `vw` term keeps growing while the slot does not, which is how a
 *     33vw hint came to ask for a 1920px image on a 1920px desktop. So every
 *     grid hint ends in a FIXED pixel term for the capped range, and each one is
 *     NAMED FOR ITS COLUMN LADDER rather than for the page that first needed it,
 *     because the next page with that ladder should reuse it rather than invent
 *     a fourteenth string.
 *
 * THE ONE RULE: a hint may be larger than the slot, never smaller. Over-fetching
 * costs bytes and is measured; under-fetching costs sharpness and is a defect.
 * `scripts/verify/image-hint-fidelity-drive.mjs` drives nine viewports and fails
 * on any under-fetch. Where a `vw` term is rounded, it is rounded UP.
 */
export const MEDIA_SIZES = {
  /** Above-fold full-bleed hero (HeroMedia default).
   *  Mobile requests ~75vw, not 100vw: the hero is a photographic BACKDROP
   *  under a 40-80% navy scrim with text on top, so a source sized for ~75vw
   *  shown across the full width is visually identical while cutting the LCP
   *  image to a smaller AVIF variant (e.g. 640-828px instead of 1080px). The
   *  optimiser still serves responsive AVIF off the 1-year edge cache.
   *  THIS IS THE ONE DELIBERATE UNDER-FETCH ON THE PLATFORM, and the drive
   *  exempts it by name rather than by widening a tolerance for everything. */
  fullBleed: '(max-width: 768px) 75vw, 1920px',
  /** Bento grid hero tile */
  bentoHero: '(max-width: 1024px) 100vw, 720px',
  /** Bento grid supporting tile */
  bentoSupporting: '(max-width: 1024px) 50vw, 360px',

  /* ---------------------------------------------------------------------
   * RAIL CELLS. A fixed width with one step at `sm` (640px). Every one is
   * `(min-width: 640px) {sm}px, {base}px` built from src/lib/ui/rhythm.ts,
   * and the guard proves it.
   * ------------------------------------------------------------------- */

  /** Standard rail event card. Cell EVENT_CARD_PX 240 / 280. */
  railEventCard: '(min-width: 640px) 280px, 240px',
  /** Lead feature card in a rail. Cell FEATURE_CARD_PX 300 / 420. */
  railFeatureCard: '(min-width: 640px) 420px, 300px',
  /** Compact square card (genre and trending rails). Cell SQUARE_CARD_PX 180 / 200. */
  railSquareCard: '(min-width: 640px) 200px, 180px',
  /** Scene / sound tile. Cell SCENE_TILE_PX 150 / 168. */
  railSceneTile: '(min-width: 640px) 168px, 150px',
  /** City "destination" tile in the homepage rail. Cell CITY_TILE_PX 280 / 340.
   *  This is the one that was UNDER-fetching: the old shared `rail` hint claimed
   *  288px for a slot that renders at 338. */
  railCityTile: '(min-width: 640px) 340px, 280px',
  /** Heritage community tile in the "Find your community" rail.
   *  Cell COMMUNITY_TILE_PX 160 / 180. */
  railCommunityTile: '(min-width: 640px) 180px, 160px',
  /** Category tile in the "Browse by category" rail, including the Communities
   *  doorway tile that leads it. Cell COMPACT_TILE_PX 220 / 260. */
  railCompactTile: '(min-width: 640px) 260px, 220px',
  /** Portrait tile in a profile-page rail: communities on a city page, cities on
   *  an organiser or venue profile. Cell WIDE_TILE_PX 260 / 280. */
  railWideTile: '(min-width: 640px) 280px, 260px',
  /** Format tile in a city page's "what's on" rail. Cell STANDARD_TILE_PX 240 / 260. */
  railStandardTile: '(min-width: 640px) 260px, 240px',
  /** A rail cell with NO `sm` step: the flat `w-[280px]` used by the event rails
   *  on /feed, /city/*, /community/*, /venues/*, /artists/* and /organisers/*.
   *  One number because the cell is one number. The old `rail` hint said 256px
   *  below 640, which under-stated this cell by 24px. */
  railFlat: '280px',
  /** Live-vibe horizontal marquee */
  marquee: '280px',

  /* ---------------------------------------------------------------------
   * GRIDS, named for the column ladder they describe. Viewport-relative until
   * max-w-7xl caps the content at 1336px, then a fixed term. The ladder in each
   * comment is the grid class the caller renders, so the two can be checked
   * against each other by eye in review.
   * ------------------------------------------------------------------- */

  /** `grid-cols-1 md:grid-cols-2`, gap-6. The guides hub. Capped slot 656px. */
  gridOneTwo: '(max-width: 767px) 100vw, (max-width: 1399px) 50vw, 660px',
  /** `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, gap-6. The event-results grid
   *  on eight templates: city, suburb, community-by-city, category events, venue,
   *  organiser and the feed. Capped slot 427px. Its predecessor claimed the
   *  two-up step began at 640 and it begins at 768. */
  gridOneTwoThree: '(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1399px) 33vw, 430px',
  /** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, gap-4. The sold-out
   *  suggestions grid and the related-communities grid. Two-up at sm rather than
   *  md, which is the one band that separates it from gridOneTwoThree.
   *  Capped slot 433px. */
  gridOneTwoThreeSm: '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1399px) 33vw, 435px',
  /** `grid-cols-1 md:grid-cols-3`, gap-6. The category landing grid, which skips
   *  the two-column step entirely. Capped slot 427px. */
  gridOneThree: '(max-width: 767px) 100vw, (max-width: 1399px) 33vw, 430px',
  /** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, gap-6.
   *  The /events results grid, the second largest image surface on the platform.
   *  Capped slot 316px, and the `xl` step was missing from the old hint. */
  gridOneTwoThreeFour: '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 320px',
  /** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, gap-4. The faith landing grid.
   *  Capped slot 322px. */
  gridOneTwoFour: '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1399px) 25vw, 325px',
  /** `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, gap-3/gap-4. The /cities index,
   *  the event gallery and the waitlist city picker. Capped slot 322px. */
  gridTwoThreeFour: '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1399px) 25vw, 325px',
  /** `grid-cols-2 md:grid-cols-4 lg:grid-cols-5`, gap-3/gap-4. The /communities
   *  index. Capped slot 254px. */
  gridTwoFourFive: '(max-width: 767px) 50vw, (max-width: 1023px) 25vw, (max-width: 1399px) 21vw, 255px',
  /** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, gap-4/gap-5. Capped slot 251px.
   *  21vw rather than 20vw for the five-up band: a five-column grid is a fifth of
   *  the container MINUS four gaps, so the honest rounding is upwards, and 21
   *  also keeps the candidate list at eight rather than nine. */
  gridTwoThreeFive: '(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1399px) 21vw, 255px',
  /** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`, gap-3/gap-4. The homepage
   *  community value band and the sub-communities grid. Capped slot 207px.
   *  The six-up band is written in pixels rather than as 17vw because at 1279 a
   *  vw term asks the browser for 640 and the pixel term asks for 384, for the
   *  same 189px slot. */
  gridTwoThreeSix: '(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 190px, 210px',

  /* ---------------------------------------------------------------------
   * MARKETING. Lane B's surfaces (the organiser landing and its family).
   *
   * `featureBand` used to be here alone, and it dressed THREE different band
   * layouts at once, which is the same fault the grid hints above were split to
   * end. It was not only waste: two of the three were UNDER-fetched, so the
   * bands on /organisers and /about rendered BLURRY at every desktop width,
   * on the marketing surface every outreach message points a stranger at.
   * Driven on 19 September 2026 at nine viewports at DPR 2
   * (`C:\dev\EVIDENCE\LB-BANDS\before-drive.txt`):
   *
   *     /organisers 1280   a 1214px band needed 2428, the browser chose 1920  x0.79
   *     /organisers 1440   a 1334px band needed 2668, the browser chose 1920  x0.72
   *     /about      1920   a 1920px band needed 3840, the browser chose 1920  x0.50
   *
   * So there is now one hint per band layout, named for the layout. Picking
   * the wrong one is a visible mistake in review rather than an invisible one
   * in the network panel.
   * ------------------------------------------------------------------- */

  /** `grid-cols-1 lg:grid-cols-2`, gap-16, inside `ContentSection width="wide"`.
   *  The alternating image-and-text feature band on /organisers and /waitlist.
   *  One column below `lg`, half the content column above it. Capped slot
   *  636px: the container caps at 1400px, 32px of padding a side leaves 1336px
   *  of content, less the 64px gap, halved. The two-column step begins at 1024
   *  and its predecessor claimed 1025, so at exactly 1024 a 448px band asked
   *  for a full viewport. */
  bandHalfColumn: '(max-width: 1023px) 100vw, (max-width: 1399px) 50vw, 640px',
  /** A band image filling the WHOLE capped content column, not half of it: the
   *  Founding Organiser offer band on /organisers, whose photograph is the
   *  `absolute inset-0` backdrop of a full-width card. Capped slot 1336px, and
   *  this is the layout that rendered at x0.72 while wearing the half-column
   *  hint. */
  bandFullColumn: '(max-width: 1399px) 100vw, 1340px',
  /** A band that is the full VIEWPORT wide, outside any container: the
   *  photographic story band on /about. There is no cap to fall back to, so
   *  there is no fixed term. This is the layout that rendered at x0.50. */
  bandFullBleed: '100vw',
  /** A screenshot inside guide prose (`max-w-3xl` with its own padding), for
   *  GuideShotImage. Capped slot 720px between 768 and 1023, 704px above it.
   *  It wore the band hint, which claimed 640px: larger than the slot at DPR 2
   *  only because the candidate ladder rounds up to 1920, and SMALLER than it
   *  at DPR 1, which the fidelity drive does not measure. */
  guideShot: '(max-width: 767px) 100vw, 720px',
  /** `grid-cols-1 gap-6 lg:grid-cols-2` inside the DASHBOARD container, beside
   *  the sidebar: the invitation card on the organiser Launch Kit. Capped slot
   *  636px.
   *
   *  THE LADDER, and it is the dashboard's rather than a public page's, which is
   *  the whole reason the old hint was wrong. The sidebar is `hidden md:block`
   *  and `w-16` collapsed or `w-60` expanded, so the WIDEST case is collapsed and
   *  the hint is written from that one. `main` carries the padding (16 / 24 at
   *  `sm` / 32 at `lg`) OUTSIDE its `max-w-7xl`, so the full 1400px is content,
   *  unlike every public container in this file. The card then spends 52px of its
   *  column on two 1px borders and `px-6`.
   *
   *      v < 768   one column, no sidebar        slot = v - 84  (v < 640) or v - 100
   *      768-1023  one column, 64px sidebar      slot = v - 164
   *      1024-1527 two columns, 64px sidebar     slot = v/2 - 128
   *      >= 1528   two columns, container capped slot = 636
   *
   *  IT WAS `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px`, which
   *  describes a three-up public grid this call site has never been in, and it
   *  under-fetched at 7 of the 9 viewports the drive claims the contract at.
   *  Driven at DPR 2 on 19 September 2026
   *  (`C:\dev\EVIDENCE\LB-TILE\before\report.json`):
   *
   *      1920  a 636px slot needed 1272, the browser chose 640   x0.50
   *       640  a 540px slot needed 1080, the browser chose 640   x0.59
   *      1440  a 504px slot needed 1008, the browser chose 640   x0.64
   *
   *  The 1920 line is quoted first because it was the one nobody saw: the drive
   *  printed its first six under-fetches and stopped, so the worst of the seven
   *  was in the report and not on the screen. It prints the count now.
   *
   *  As a RATIO of hint to slot, 8 of the 9 were short; 390 is the extra one and
   *  the candidate ladder rescued it, because 50vw of 390 is 195 and 195x2
   *  rounds up to the 640 rung, which clears a 612 need by accident. A hint that
   *  is only right because of rounding is not right.
   *
   *  It stood uncorrected because it could not be measured: the route is behind
   *  a login and this drive signed in to nothing. That is now `AUTHED_PATHS` in
   *  `scripts/verify/image-hint-fidelity-drive.mjs`. */
  tileDashboardHalfColumn: '(max-width: 767px) 90vw, (max-width: 1023px) 85vw, (max-width: 1527px) 42vw, 640px',

  /** The 56px square thumbnail in a dashboard list row (h-14 w-14). It wore the
   *  shared rail hint, which claimed 256px for it and made the browser fetch a
   *  640px-wide image for a 56px square: x11.4, the worst single ratio found. */
  listThumb: '56px',

  /* THE FIVE AVATAR SLOTS ARE ALSO DECLARED IN `./avatar-sizes`, AS FINISHED
   * STRINGS IN BOTH PLACES, AND THAT DUPLICATION IS DELIBERATE.
   *
   * WHY THEY ARE ALSO OVER THERE, measured on the build of 19 September 2026:
   * `dashboard-topbar.tsx` renders `OrganiserAvatar`, which imported THIS file,
   * and `MEDIA_SIZES` is one object literal, so importing one member ships all
   * of it. Every dashboard route's FIRST LOAD carried a 21,005 byte chunk
   * holding every hint on the platform, hero to gallery, in order to render one
   * 32px circle.
   *
   * WHY THEY ARE STILL HERE. This table is what the configured width ladder in
   * next.config.ts is derived from, and the derivation reads STRING LITERALS.
   * Replacing these five with `AVATAR_SIZES.xs` and friends was tried in this
   * same change and `candidate-ladder-has-no-dead-rung` immediately caught it:
   * "the width 32 is offered and nothing can select it ... the smallest fixed
   * slot on the platform is 56 CSS pixels". The ladder had lost the avatars.
   *
   * WHY NOT AN IMPORT. `image-hints-match-the-cell` refuses one, by name: "it is
   * the most widely reached module in the media layer, so whatever it imports
   * reaches every route that renders any image. Keep the finished strings here."
   *
   * SO THE DRIFT IS CLOSED BY A TEST RATHER THAN BY A REFERENCE:
   * `tests/unit/media/avatar-sizes-is-a-leaf.test.ts` fails if either
   * declaration changes without the other. */
  avatarXs: '24px',
  avatarTopbar: '32px',
  avatarSm: '32px',
  avatarMd: '48px',
  avatarLg: '96px',
} as const

export type MediaSizeKey = keyof typeof MEDIA_SIZES
