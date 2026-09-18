import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'
import { HoverWash } from './hover-wash'

/**
 * EventCardMedia - the only allowed surface for event imagery in card,
 * tile, bento, rail, marquee, and list-row layouts.
 *
 * Variants map to the layout role and apply the correct sizes hint, quality
 * tier, and lazy/priority defaults. Feature components do NOT pass raw
 * `sizes` or `quality` - they pick a variant.
 *
 * See docs/MEDIA-ARCHITECTURE.md §3 for the role → variant table.
 *
 * A VARIANT NAMES A LAYOUT, NOT A FEELING. Until 18 September 2026 this
 * component had a variant called `card`, and four different layouts picked it:
 * a 160px community tile, a 240px rail card, a 420px feature card and a results
 * grid. They cannot share one `sizes` hint, and the browser believed the hint
 * over the layout every time - at a 1920px desktop it fetched a 1920px-wide
 * image for a 278px slot. Every variant below now names one cell or one column
 * ladder, so picking the wrong one is a visible mistake in review rather than an
 * invisible one in the network panel.
 */

export type EventCardMediaVariant =
  | 'bento-hero'
  | 'bento-supporting'
  /* Rail cells: a fixed width with one step at Tailwind's `sm` (640px). */
  | 'rail-event-card'
  | 'rail-feature-card'
  | 'rail-square-card'
  | 'rail-scene-tile'
  | 'rail-community-tile'
  /* A rail cell with no `sm` step: a flat w-[280px]. */
  | 'rail-flat'
  /* Grids, named for the column ladder each one renders. */
  | 'grid-one-two-three'
  | 'grid-one-two-three-sm'
  | 'grid-one-three'
  | 'grid-one-two-three-four'
  | 'grid-one-two-four'
  | 'grid-two-three-six'
  /**
   * `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, which is the organiser
   * landing page's community strip and nothing else.
   *
   * IT KEEPS THE OLD NAME ON PURPOSE. That file is lane B's marketing surface
   * and lane C does not edit it, so the variant it names still exists and now
   * resolves to the hint that is CORRECT for its ladder rather than to the
   * generic one that was wrong for everybody. The rename to
   * `grid-two-three-five` is one line in that file and is written up as the
   * BORDER line in C:\dev\REVIEW-QUEUE-C.md.
   */
  | 'card'
  /* A fixed 56px square thumbnail in a dashboard list row. */
  | 'list-thumb'
  | 'marquee'

interface Props {
  /** Source URL - raster recommended; SVG allowed for placeholder thumbs. */
  src: string
  /** Alt text - required. Empty string only for purely decorative tiles. */
  alt: string
  /** Layout variant. Drives sizes + quality + priority defaults. */
  variant: EventCardMediaVariant
  /**
   * Above-fold first row of a grid? Pass true to opt this single tile in
   * to priority loading. Defaults false (lazy).
   */
  priority?: boolean
  /** Object-fit override. Defaults to 'cover'. */
  objectFit?: 'cover' | 'contain'
  /**
   * CSS object-position for the cover crop. Defaults to centre. Pass a
   * focal point (e.g. "50% 38%") for slot imagery whose subject sits
   * off-centre so a square/portrait tile does not lop off heads or hands.
   */
  objectPosition?: string
  /** Extra classes for the <Image>. */
  className?: string
}

const SIZES_BY_VARIANT: Record<EventCardMediaVariant, string> = {
  'bento-hero': MEDIA_SIZES.bentoHero,
  'bento-supporting': MEDIA_SIZES.bentoSupporting,
  'rail-event-card': MEDIA_SIZES.railEventCard,
  'rail-feature-card': MEDIA_SIZES.railFeatureCard,
  'rail-square-card': MEDIA_SIZES.railSquareCard,
  'rail-scene-tile': MEDIA_SIZES.railSceneTile,
  'rail-community-tile': MEDIA_SIZES.railCommunityTile,
  'rail-flat': MEDIA_SIZES.railFlat,
  'grid-one-two-three': MEDIA_SIZES.gridOneTwoThree,
  'grid-one-two-three-sm': MEDIA_SIZES.gridOneTwoThreeSm,
  'grid-one-three': MEDIA_SIZES.gridOneThree,
  'grid-one-two-three-four': MEDIA_SIZES.gridOneTwoThreeFour,
  'grid-one-two-four': MEDIA_SIZES.gridOneTwoFour,
  'grid-two-three-six': MEDIA_SIZES.gridTwoThreeSix,
  card: MEDIA_SIZES.gridTwoThreeFive,
  'list-thumb': MEDIA_SIZES.listThumb,
  marquee: MEDIA_SIZES.marquee,
}

/*
 * Quality is a function of how large the image renders, not of which rail it
 * sits in: the small fixed cells carry the rail tier and everything that can
 * render past ~280px carries the card tier. This is the same split as before
 * the variants were separated, restated per variant so it cannot drift.
 */
const QUALITY_BY_VARIANT: Record<EventCardMediaVariant, number> = {
  'bento-hero': MEDIA_QUALITY.card,
  'bento-supporting': MEDIA_QUALITY.card,
  'rail-event-card': MEDIA_QUALITY.card,
  'rail-feature-card': MEDIA_QUALITY.card,
  'rail-square-card': MEDIA_QUALITY.rail,
  'rail-scene-tile': MEDIA_QUALITY.rail,
  'rail-community-tile': MEDIA_QUALITY.card,
  'rail-flat': MEDIA_QUALITY.rail,
  'grid-one-two-three': MEDIA_QUALITY.card,
  'grid-one-two-three-sm': MEDIA_QUALITY.card,
  'grid-one-three': MEDIA_QUALITY.card,
  'grid-one-two-three-four': MEDIA_QUALITY.card,
  'grid-one-two-four': MEDIA_QUALITY.card,
  'grid-two-three-six': MEDIA_QUALITY.card,
  card: MEDIA_QUALITY.card,
  'list-thumb': MEDIA_QUALITY.rail,
  marquee: MEDIA_QUALITY.rail,
}

export function EventCardMedia({
  src,
  alt,
  variant,
  priority = false,
  objectFit = 'cover',
  objectPosition,
  className = '',
}: Props) {
  // A bad/missing/disallowed URL must never 500 the card or its rail.
  const safeSrc = resolveImageSrc(src)
  if (!safeSrc) {
    return <BrandedPlaceholder className={className} />
  }
  return (
    <>
      <Image
        src={safeSrc}
        alt={alt}
        fill
        sizes={SIZES_BY_VARIANT[variant]}
        quality={QUALITY_BY_VARIANT[variant]}
        priority={priority}
        fetchPriority={priority ? 'high' : 'auto'}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`card-media-img ${objectFit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
        style={objectPosition ? { objectPosition } : undefined}
      />
      <HoverWash />
    </>
  )
}
