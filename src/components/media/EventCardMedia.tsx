import Image from 'next/image'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'

/**
 * EventCardMedia — the only allowed surface for event imagery in card,
 * tile, bento, rail, marquee, and list-row layouts.
 *
 * Variants map to the layout role and apply the correct sizes hint, quality
 * tier, and lazy/priority defaults. Feature components do NOT pass raw
 * `sizes` or `quality` — they pick a variant.
 *
 * See docs/MEDIA-ARCHITECTURE.md §3 for the role → variant table.
 */

export type EventCardMediaVariant =
  | 'bento-hero'
  | 'bento-supporting'
  | 'card'
  | 'rail'
  | 'marquee'

interface Props {
  /** Source URL — raster recommended; SVG allowed for placeholder thumbs. */
  src: string
  /** Alt text — required. Empty string only for purely decorative tiles. */
  alt: string
  /** Layout variant. Drives sizes + quality + priority defaults. */
  variant: EventCardMediaVariant
  /**
   * Above-fold first row of a grid? Pass true to opt this single tile in
   * to priority loading. Defaults false (lazy).
   */
  priority?: boolean
  /** Object-fit override. Defaults to 'cover'. */
  objectFit?: 'cover' | 'contain'
  /** Extra classes for the <Image>. */
  className?: string
}

const SIZES_BY_VARIANT: Record<EventCardMediaVariant, string> = {
  'bento-hero': MEDIA_SIZES.bentoHero,
  'bento-supporting': MEDIA_SIZES.bentoSupporting,
  card: MEDIA_SIZES.card,
  rail: MEDIA_SIZES.rail,
  marquee: MEDIA_SIZES.marquee,
}

const QUALITY_BY_VARIANT: Record<EventCardMediaVariant, number> = {
  'bento-hero': MEDIA_QUALITY.card,
  'bento-supporting': MEDIA_QUALITY.card,
  card: MEDIA_QUALITY.card,
  rail: MEDIA_QUALITY.rail,
  marquee: MEDIA_QUALITY.rail,
}

export function EventCardMedia({
  src,
  alt,
  variant,
  priority = false,
  objectFit = 'cover',
  className = '',
}: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={SIZES_BY_VARIANT[variant]}
      quality={QUALITY_BY_VARIANT[variant]}
      priority={priority}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={`${objectFit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
    />
  )
}
