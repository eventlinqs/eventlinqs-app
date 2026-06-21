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
 * Always lazy. Card-tier quality + card sizes (the rail is rendered as a
 * 2/3/6-column grid of cards, not a horizontal scroll, so card sizes
 * are correct here).
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
        sizes={MEDIA_SIZES.card}
        quality={MEDIA_QUALITY.card}
        loading="lazy"
        decoding="async"
        className={`card-media-img object-cover ${className}`}
      />
      <HoverWash />
    </>
  )
}
