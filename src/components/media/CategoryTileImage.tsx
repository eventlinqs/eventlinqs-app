import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'

/**
 * CategoryTileImage - the only allowed surface for category-tile imagery
 * (category landing tiles, category pickers, category browse cards).
 *
 * Always lazy. Always category sizes hint. Alt text required (categories
 * are user-facing labels - semantic alt is mandatory for SEO).
 *
 * See docs/MEDIA-ARCHITECTURE.md §3 for the role → variant table.
 */

interface Props {
  src: string
  /** Required - category tile alt is SEO-relevant (page indexes by category). */
  alt: string
  /** Above-fold (e.g. category landing hero); defaults false. */
  priority?: boolean
  className?: string
}

export function CategoryTileImage({
  src,
  alt,
  priority = false,
  className = '',
}: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={MEDIA_SIZES.category}
      quality={MEDIA_QUALITY.card}
      priority={priority}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={`object-cover ${className}`}
    />
  )
}
