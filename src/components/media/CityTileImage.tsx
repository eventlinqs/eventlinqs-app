import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'
import { HoverWash } from './hover-wash'

/**
 * CityTileImage - the only allowed surface for city-specific imagery
 * (rail tiles, city landing heroes, region selectors).
 *
 * Dual-mode:
 *   - Local SVG (paths starting with `/cities/`): renders raw <img> with
 *     `loading="lazy"` and `decoding="async"`. Next/Image's optimizer would
 *     re-encode the SVG into a raster, defeating the point.
 *   - Remote raster: renders <Image> with the caller's layout hint + rail quality.
 *
 * The component decides HOW to render - callers do not. This way the `<img>`
 * escape hatch (and its eslint-disable annotation) lives in exactly one file.
 *
 * WHAT THE CALLER MUST DECIDE IS THE LAYOUT, because the component cannot see
 * it. Six callers render this at six different widths, from a 173px tile in the
 * /cities grid to a 340px tile in the homepage rail, and until 18 September 2026
 * all six shared one hint. It was too small for the widest of them, so the city
 * tiles on the homepage and on /cities fetched a 640px image for a slot needing
 * 644 and were BLURRY on every 2x screen
 * (`C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt`).
 */

/** The layouts this tile is rendered in. Each one names a real cell or ladder. */
export type CityTileLayout =
  | 'rail-city-tile'
  | 'rail-wide-tile'
  | 'rail-standard-tile'
  | 'rail-compact-tile'
  | 'grid-two-three-four'
  | 'grid-one-two-three-sm'
  | 'grid-one-two-three'

const SIZES_BY_LAYOUT: Record<CityTileLayout, string> = {
  'rail-city-tile': MEDIA_SIZES.railCityTile,
  'rail-wide-tile': MEDIA_SIZES.railWideTile,
  'rail-standard-tile': MEDIA_SIZES.railStandardTile,
  'rail-compact-tile': MEDIA_SIZES.railCompactTile,
  'grid-two-three-four': MEDIA_SIZES.gridTwoThreeFour,
  'grid-one-two-three-sm': MEDIA_SIZES.gridOneTwoThreeSm,
  'grid-one-two-three': MEDIA_SIZES.gridOneTwoThree,
}

interface Props {
  src: string
  alt: string
  /** The cell or grid this tile is rendered in. Drives the `sizes` hint. */
  layout: CityTileLayout
  /** Optional priority for above-fold city heroes. Defaults false. */
  priority?: boolean
  /** CSS object-position for the cover crop (focal point). Defaults to centre. */
  objectPosition?: string
  className?: string
}

function isLocalSvg(src: string): boolean {
  return /\.svg(\?|#|$)/i.test(src) || src.startsWith('/cities/')
}

export function CityTileImage({
  src,
  alt,
  layout,
  priority = false,
  objectPosition,
  className = '',
}: Props) {
  if (isLocalSvg(src)) {
    return (
      <>
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={`card-media-img absolute inset-0 h-full w-full object-cover ${className}`}
          style={objectPosition ? { objectPosition } : undefined}
        />
        <HoverWash />
      </>
    )
  }

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
        quality={MEDIA_QUALITY.rail}
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
