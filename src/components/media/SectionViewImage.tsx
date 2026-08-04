import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'

/**
 * SectionViewImage - the media surface for view-from-seat photographs on
 * the seating surfaces (the buyer map's view card and the room studio's
 * per-section slot). A real photo, lazily loaded, never on the LCP path;
 * feature code renders it inside a sized parent and never constructs
 * <Image> itself (MEDIA-ARCHITECTURE).
 */
interface Props {
  src: string
  alt: string
  className?: string
}

export function SectionViewImage({ src, alt, className = '' }: Props) {
  const safeSrc = resolveImageSrc(src)
  if (!safeSrc) return <BrandedPlaceholder className={className} />
  return (
    <Image
      src={safeSrc}
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
