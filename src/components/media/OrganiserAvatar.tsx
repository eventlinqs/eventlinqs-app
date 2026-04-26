'use client'

import Image from 'next/image'
import { useState } from 'react'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'

/**
 * OrganiserAvatar - the only allowed surface for any avatar on EventLinqs:
 * dashboard topbar, organiser cards, ticket holder badges, list rows.
 *
 * Renders one of:
 *   - <Image> with explicit dimensions if `src` is a remote raster.
 *   - Initials in a coloured circle if `src` is missing or fails to load.
 *
 * Above-fold dashboard topbar usage passes `priority` since the avatar is
 * an LCP candidate on dashboard pages.
 *
 * See docs/MEDIA-ARCHITECTURE.md §8.
 */

export type OrganiserAvatarSize = 'xs' | 'sm' | 'md' | 'topbar' | 'lg'

interface Props {
  src?: string | null
  /** Display name used to derive initials when src is missing. */
  name: string
  size: OrganiserAvatarSize
  /** Above-fold (e.g. dashboard topbar) - sets priority. Defaults false. */
  priority?: boolean
  className?: string
}

const PIXELS_BY_SIZE: Record<OrganiserAvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  topbar: 32,
  lg: 96,
}

const SIZES_HINT_BY_SIZE: Record<OrganiserAvatarSize, string> = {
  xs: '24px',
  sm: MEDIA_SIZES.avatarSm,
  md: MEDIA_SIZES.avatarMd,
  topbar: MEDIA_SIZES.avatarTopbar,
  lg: MEDIA_SIZES.avatarLg,
}

function initialsOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function OrganiserAvatar({
  src,
  name,
  size,
  priority = false,
  className = '',
}: Props) {
  const [errored, setErrored] = useState(false)
  const px = PIXELS_BY_SIZE[size]
  const showImage = src && !errored

  const baseClasses =
    `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ` +
    `bg-ink-200 text-ink-700 font-semibold ${className}`

  if (showImage) {
    return (
      <span
        className={baseClasses}
        style={{ width: px, height: px }}
      >
        <Image
          src={src}
          alt={name}
          width={px}
          height={px}
          sizes={SIZES_HINT_BY_SIZE[size]}
          quality={MEDIA_QUALITY.avatar}
          priority={priority}
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      </span>
    )
  }

  // Initials fallback - no <img>, no network.
  const fontPx = Math.round(px * 0.4)
  return (
    <span
      className={baseClasses}
      aria-label={name}
      style={{ width: px, height: px, fontSize: fontPx }}
    >
      {initialsOf(name)}
    </span>
  )
}
