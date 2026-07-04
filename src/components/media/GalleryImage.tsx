import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'
import { HoverWash } from './hover-wash'

/**
 * GalleryImage - the media surface for organiser event-gallery thumbnails
 * (below the fold on the event detail page). Lazy + blur placeholder per
 * MEDIA-ARCHITECTURE §6, so a full gallery never costs LCP and never pops in.
 *
 * Feature code renders this inside a sized, CLICKABLE parent (the gallery tiles
 * are lightbox buttons, per the affordance law); it never constructs <Image>.
 */
interface Props {
  src: string
  alt: string
  /** blurDataURL from the upload pipeline; enables placeholder="blur". */
  blurDataURL?: string
  className?: string
}

export function GalleryImage({ src, alt, blurDataURL, className = '' }: Props) {
  const safeSrc = resolveImageSrc(src)
  if (!safeSrc) return <BrandedPlaceholder className={className} />
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
        placeholder={blurDataURL ? 'blur' : 'empty'}
        blurDataURL={blurDataURL}
        className={`card-media-img object-cover ${className}`}
      />
      <HoverWash />
    </>
  )
}
