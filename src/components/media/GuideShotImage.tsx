import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'

/**
 * GuideShotImage - the media surface for a screenshot inside guide prose.
 *
 * Editorial imagery within reading, NOT a tile in a grid, so it carries no
 * hover wash and no brighten: it is not tappable and must not pretend to be
 * (the affordance law cuts both ways). It sits in its own sized figure with a
 * caption supplied by the guide.
 */
interface Props {
  src: string
  alt: string
  className?: string
}

export function GuideShotImage({ src, alt, className = '' }: Props) {
  const safeSrc = resolveImageSrc(src)
  if (!safeSrc) return <BrandedPlaceholder className={className} />
  return (
    <Image
      src={safeSrc}
      alt={alt}
      fill
      sizes={MEDIA_SIZES.featureBand}
      quality={MEDIA_QUALITY.card}
      loading="lazy"
      decoding="async"
      className={`object-cover object-top ${className}`}
    />
  )
}
