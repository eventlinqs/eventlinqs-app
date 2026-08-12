'use client'

import Image from 'next/image'
import { useState } from 'react'
import { resolveImageSrc } from './safe-image-src'

/**
 * The organiser's own mark, at its own shape.
 *
 * OrganiserAvatar exists for the round profile picture and forces a square
 * crop; a mark is not a portrait. A logo is a landscape wordmark as often as
 * it is a square badge, and squashing one into the other is the defect this
 * component exists to avoid. It fits to a HEIGHT and lets the width follow.
 *
 * It renders on the brand navy by default because that is where the mark
 * actually goes: onto the poster and the social cards. A preview on white is
 * how a black wordmark gets uploaded, looks perfect in settings, and then
 * disappears on the artwork.
 */

export type OrganiserLogoMarkProps = {
  src: string | null | undefined
  /** Used as the alt text and as the fallback when there is no mark. */
  name: string
  /** Rendered height in pixels; width follows the mark's own proportions. */
  height?: number
  /** Widest the mark may get before it is scaled down to fit. */
  maxWidth?: number
  /**
   * Server-measured placement. A dark mark needs a light tile behind it or it
   * vanishes into the navy. Defaults to the tile, which is always readable.
   */
  placement?: 'on-navy' | 'on-tile'
  className?: string
}

export function OrganiserLogoMark({
  src,
  name,
  height = 84,
  maxWidth = 200,
  placement = 'on-tile',
  className = '',
}: OrganiserLogoMarkProps) {
  const [errored, setErrored] = useState(false)
  const resolved = resolveImageSrc(src)

  if (!resolved || errored) {
    return (
      <p
        className={`text-center font-display text-xs font-bold uppercase tracking-[0.18em] text-white/70 ${className}`}
      >
        {name}
      </p>
    )
  }

  return (
    <span
      className={
        placement === 'on-tile'
          ? `inline-flex items-center justify-center rounded-lg bg-white p-2.5 ${className}`
          : `inline-flex items-center justify-center ${className}`
      }
    >
      <Image
        src={resolved}
        alt={`${name} logo`}
        width={maxWidth}
        height={height}
        // The stored object is already normalised and small; the optimiser adds
        // nothing here and would re-encode a transparent PNG.
        unoptimized
        onError={() => setErrored(true)}
        className="h-auto w-auto object-contain"
        style={{ maxHeight: height, maxWidth }}
      />
    </span>
  )
}
