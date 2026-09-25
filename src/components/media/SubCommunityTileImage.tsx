import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'
import { HoverWash } from './hover-wash'

/**
 * SubCommunityTileImage - the only allowed surface for sub-community tile
 * imagery on /community/[slug] sub-communities rail.
 *
 * Always lazy. Card-tier quality, and the hint for the ladder it actually
 * renders: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`. It is called a rail and
 * is a grid, which is how it spent a year on a hint written for a different
 * grid (`grid-cols-1 md:2 lg:3`) that was two-up where this one is six-up.
 */

interface Props {
  src: string
  alt: string
  className?: string
}

export function SubCommunityTileImage({ src, alt, className = '' }: Props) {
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
        sizes={MEDIA_SIZES.gridTwoThreeSix}
        quality={MEDIA_QUALITY.card}
        loading="lazy"
        decoding="async"
        className={`card-media-img object-cover ${className}`}
      />
      <HoverWash />
    </>
  )
}
