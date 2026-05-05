import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'

/**
 * SubCultureTileImage - the only allowed surface for sub-culture tile
 * imagery on /culture/[slug] sub-cultures rail.
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

export function SubCultureTileImage({ src, alt, className = '' }: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={MEDIA_SIZES.card}
      quality={MEDIA_QUALITY.card}
      loading="lazy"
      decoding="async"
      className={`object-cover ${className}`}
    />
  )
}
