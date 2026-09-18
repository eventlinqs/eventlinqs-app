import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'
import { HoverWash } from './hover-wash'

/**
 * CategoryTileImage - the only allowed surface for category-tile imagery
 * (category landing tiles, category pickers, category browse cards).
 *
 * Always lazy. Always category sizes hint. Alt text required (categories
 * are user-facing labels - semantic alt is mandatory for SEO).
 *
 * See docs/MEDIA-ARCHITECTURE.md §3 for the role → variant table.
 */

interface Props {
  src: string
  /** Required - category tile alt is SEO-relevant (page indexes by category). */
  alt: string
  /** The cell or grid this tile is rendered in. Drives the `sizes` hint.
   *  The rail tile and the /communities grid render at 258px and 254px at the
   *  container cap, and at 218px and 158px on a phone; one hint covered both
   *  until 18 September 2026 and was minimal for neither. */
  layout: CategoryTileLayout
  /** Above-fold (e.g. category landing hero); defaults false. */
  priority?: boolean
  /** CSS object-position for the cover crop (focal point). Defaults to centre. */
  objectPosition?: string
  className?: string
}

/** The layouts this tile is rendered in. Each one names a real cell or ladder. */
export type CategoryTileLayout = 'rail-compact-tile' | 'grid-two-four-five'

const SIZES_BY_LAYOUT: Record<CategoryTileLayout, string> = {
  'rail-compact-tile': MEDIA_SIZES.railCompactTile,
  'grid-two-four-five': MEDIA_SIZES.gridTwoFourFive,
}

export function CategoryTileImage({
  src,
  alt,
  layout,
  priority = false,
  objectPosition,
  className = '',
}: Props) {
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
        sizes={SIZES_BY_LAYOUT[layout]}
        quality={MEDIA_QUALITY.card}
        priority={priority}
        fetchPriority={priority ? 'high' : 'auto'}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`card-media-img object-cover ${className}`}
        style={objectPosition ? { objectPosition } : undefined}
      />
      <HoverWash />
    </>
  )
}
