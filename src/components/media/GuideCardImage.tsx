import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { resolveImageSrc } from './safe-image-src'
import { BrandedPlaceholder } from './decorative/branded-placeholder'
import { HoverWash } from './hover-wash'

/**
 * GuideCardImage - the media surface for a guide tile on the /guides hub.
 *
 * The image is a real screenshot of the running app, so the tile shows the
 * organiser the screen they are about to be taught. Tile role, so it carries
 * the hover illumination pair (card-media-img brighten + HoverWash whisper)
 * exactly like every other card on the platform.
 *
 * Feature code renders this inside a sized, LINKED parent (the affordance law:
 * a tile in a grid must be a working link); it never constructs <Image>.
 */
interface Props {
  src: string
  alt: string
  className?: string
}

export function GuideCardImage({ src, alt, className = '' }: Props) {
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
        className={`card-media-img object-cover object-top ${className}`}
      />
      <HoverWash />
    </>
  )
}
