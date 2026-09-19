'use client'

import Image from 'next/image'
import { useState } from 'react'
import { MEDIA_QUALITY } from './quality'
// THE FIVE AVATAR SLOTS, NOT THE WHOLE TABLE. `MEDIA_SIZES` is one object
// literal, so importing any member of it ships all of it, and this component is
// in the dashboard shell: on the build of 19 September 2026 that put a 21,005
// byte chunk carrying every hint on the platform into the first load of thirty
// dashboard routes, to render one 32px circle. `avatar-sizes.ts` is a leaf and
// `sizes.ts` spreads the same five strings, so there is still one source.
import { AVATAR_SIZES } from './avatar-sizes'
import { resolveImageSrc } from './safe-image-src'

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
  xs: AVATAR_SIZES.xs,
  sm: AVATAR_SIZES.sm,
  md: AVATAR_SIZES.md,
  topbar: AVATAR_SIZES.topbar,
  lg: AVATAR_SIZES.lg,
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
  // Resolve to a renderable URL; a disallowed host would otherwise throw in
  // next/image SSR before onError can fall back to initials.
  const resolvedSrc = resolveImageSrc(src)
  const showImage = resolvedSrc && !errored

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
          src={resolvedSrc}
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
