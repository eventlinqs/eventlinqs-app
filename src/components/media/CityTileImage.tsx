import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'

/**
 * CityTileImage — the only allowed surface for city-specific imagery
 * (rail tiles, city landing heroes, region selectors).
 *
 * Dual-mode:
 *   - Local SVG (paths starting with `/cities/`): renders raw <img> with
 *     `loading="lazy"` and `decoding="async"`. Next/Image's optimizer would
 *     re-encode the SVG into a raster, defeating the point.
 *   - Remote raster: renders <Image> with rail sizes + rail quality.
 *
 * The component decides — callers do not. This way the `<img>` escape
 * hatch (and its eslint-disable annotation) lives in exactly one file.
 */

interface Props {
  src: string
  alt: string
  /** Optional priority for above-fold city heroes. Defaults false. */
  priority?: boolean
  className?: string
}

function isLocalSvg(src: string): boolean {
  return /\.svg(\?|#|$)/i.test(src) || src.startsWith('/cities/')
}

export function CityTileImage({
  src,
  alt,
  priority = false,
  className = '',
}: Props) {
  if (isLocalSvg(src)) {
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={MEDIA_SIZES.rail}
      quality={MEDIA_QUALITY.rail}
      priority={priority}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={`object-cover ${className}`}
    />
  )
}
