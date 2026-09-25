import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'

/**
 * MarketingMedia - the only allowed surface for below-fold imagery on
 * marketing / landing surfaces (feature bands and the community / solutions
 * tile grids on /organisers and future marketing pages).
 *
 * Why a dedicated component: the media architecture (docs/MEDIA-ARCHITECTURE.md
 * §11.13) forbids constructing <Image> in feature code. Marketing bands and
 * tiles are not events, cities, or categories, so none of the existing
 * components fit their sizes role. This keeps the <Image> escape hatch inside
 * the media library where ESLint allows it.
 *
 * A VARIANT NAMES A LAYOUT, NOT A FEELING. Until 19 September 2026 there was
 * one variant called `band`, and THREE layouts wore it: a half-column feature
 * band, a full-content-column offer band, and a full-bleed story band. One
 * `sizes` string cannot be right for three widths, and two of the three were
 * under-fetched, so the bands on /organisers and /about rendered blurry at
 * every desktop width. The numbers are in `sizes.ts` beside the hints.
 *
 * Variants map to the layout and pull the correct sizes hint:
 *   - 'band-half-column' : the alternating image-and-text band, half the
 *     content column above `lg` and one column below it.
 *   - 'band-full-column' : a band filling the whole capped content column.
 *   - 'band-full-bleed'  : a band the full viewport wide, outside any container.
 *   - 'tile-dashboard-half-column' : a tile in a two-up grid inside the
 *                          DASHBOARD container, beside the sidebar. Its ladder
 *                          is not any public page's, which is why it wore a
 *                          public grid's hint and under-fetched for months.
 *
 * Always lazy (below the fold by definition - the hero is HeroMedia, the only
 * priority image per route). Renders into a `fill` parent that sets the aspect.
 */

export type MarketingMediaVariant =
  | 'band-half-column'
  | 'band-full-column'
  | 'band-full-bleed'
  | 'tile-dashboard-half-column'

interface Props {
  /** Raster URL from the platform photo library. SVG falls back gracefully. */
  src: string
  /** Alt text - required. Empty string only for purely decorative imagery. */
  alt: string
  /** Layout variant. Drives the sizes hint. */
  variant: MarketingMediaVariant
  /** CSS object-position for the cover crop. Defaults to "50% 50%". */
  objectPosition?: string
  /** Extra classes for the <Image>. */
  className?: string
}

const SIZES_BY_VARIANT: Record<MarketingMediaVariant, string> = {
  'band-half-column': MEDIA_SIZES.bandHalfColumn,
  'band-full-column': MEDIA_SIZES.bandFullColumn,
  'band-full-bleed': MEDIA_SIZES.bandFullBleed,
  'tile-dashboard-half-column': MEDIA_SIZES.tileDashboardHalfColumn,
}

export function MarketingMedia({
  src,
  alt,
  variant,
  objectPosition = '50% 50%',
  className = '',
}: Props) {
  // A bad/missing/disallowed URL must never 500 the band or its grid.
  const safeSrc = resolveImageSrc(src)
  if (!safeSrc) {
    return <BrandedPlaceholder className={className} />
  }
  return (
    <Image
      src={safeSrc}
      alt={alt}
      fill
      sizes={SIZES_BY_VARIANT[variant]}
      quality={MEDIA_QUALITY.card}
      loading="lazy"
      decoding="async"
      className={`object-cover ${className}`}
      style={{ objectPosition }}
    />
  )
}
