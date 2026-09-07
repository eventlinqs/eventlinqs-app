'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { BrandedPlaceholder } from './decorative/branded-placeholder'

/**
 * HeroRaster - the LCP raster of a hero, and what paints if it fails to load.
 *
 * Close-out C17.2 (7 September 2026): a hero must never show a broken-image
 * glyph, a bare rectangle or a spinner. HeroMedia already refused a bad or
 * disallowed URL before this, but a raster that 404s or times out at runtime
 * left the browser's broken glyph in the hero, because next/image's onError is
 * only reachable from a client component and HeroMedia is a server component.
 *
 * This is that client component. It renders the SAME priority <Image> HeroMedia
 * rendered before (server rendered, static, no transition: the LCP law holds),
 * and on failure swaps in the designed treatment: the navy and gold ramp of
 * BrandedPlaceholder under the hero's own headline stack, so the surface still
 * reads as intentional. Two failure paths are covered: `onError` for a failure
 * after hydration, and a post-hydration read of the element for one that fired
 * before React attached its listener (a completed image with no natural width
 * is a failed image).
 */
export interface HeroRasterProps {
  src: string
  alt: string
  priority: boolean
  sizes: string
  quality: number
  objectPosition: string
}

export function HeroRaster({ src, alt, priority, sizes, quality, objectPosition }: HeroRasterProps) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // A failure that fired before hydration left no event to catch, so the
  // element itself is read once, on the next frame (never a synchronous state
  // change inside the effect): a completed image with no natural width failed.
  useEffect(() => {
    const img = ref.current
    if (!img) return
    const frame = requestAnimationFrame(() => {
      if (img.complete && img.naturalWidth === 0) setFailed(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [src])

  if (failed) {
    return <BrandedPlaceholder chromeless />
  }

  return (
    <Image
      ref={ref}
      src={src}
      alt={alt}
      fill
      priority={priority}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      sizes={sizes}
      quality={quality}
      className="object-cover"
      style={{ objectPosition }}
      onError={() => setFailed(true)}
    />
  )
}
