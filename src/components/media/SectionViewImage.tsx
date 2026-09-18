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
      /* Both callers render this inside a sidebar panel whose width is set by
         the surrounding checkout or builder layout rather than by a grid, and
         neither is a public route the image-hint drive covers. It is given the
         most generous desktop hint on the platform deliberately: a panel is
         narrower than a third of the viewport everywhere it appears, so this
         cannot under-fetch, and being unmeasured it is not claimed to be
         minimal. */
      sizes={MEDIA_SIZES.gridOneTwoThree}
      quality={MEDIA_QUALITY.card}
      loading="lazy"
      decoding="async"
      className={`object-cover ${className}`}
    />
  )
}
