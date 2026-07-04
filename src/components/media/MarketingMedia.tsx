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
 * Variants map to the layout role and pull the correct sizes hint:
 *   - 'band' : a ~half-width alternating image+text feature band image.
 *   - 'tile' : a community / solutions grid tile (2-up mobile, 3-4-up desktop).
 *
 * Always lazy (below the fold by definition - the hero is HeroMedia, the only
 * priority image per route). Renders into a `fill` parent that sets the aspect.
 */

export type MarketingMediaVariant = 'band' | 'tile'

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
  band: MEDIA_SIZES.featureBand,
  tile: MEDIA_SIZES.featureTile,
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
