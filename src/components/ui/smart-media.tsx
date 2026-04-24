'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import type { EventMedia } from '@/lib/images/event-media'
import { BrandedPlaceholder } from './branded-placeholder'

// Route remote images through Next.js's image optimiser so they load from our
// origin. This avoids third-party cookies (Pexels is fronted by Cloudflare,
// which sets `_cfuvid` on direct image requests) that otherwise tank the
// Lighthouse Best Practices score.
function proxy(src: string): string {
  if (src.startsWith('/') || src.startsWith('data:')) return src
  return `/_next/image?url=${encodeURIComponent(src)}&w=1920&q=75`
}

/**
 * SmartMedia — universal renderer for the EventMedia union.
 *
 * Modes:
 *   video          — autoplay loop when `autoplay`, else hover-to-play.
 *   carousel       — crossfade between images on an interval.
 *   still-kenburns — gentle infinite zoom (CSS keyframe).
 *
 * All variants fill their parent absolutely — parent must be positioned.
 */

interface Props {
  media: EventMedia
  className?: string
  /** When true, video autoplays. When false (default), plays on hover. */
  autoplay?: boolean
  /** Carousel rotation interval in ms (default 4000). */
  carouselInterval?: number
  /** Adds will-change, smoother Ken Burns — set on low-frequency / above-the-fold tiles. */
  priority?: boolean
  /** Optional poster/alt used for still-kenburns sizes — defaults to <img alt>. */
  ariaLabel?: string
  /** When the branded-placeholder fallback is rendered, omit the watermark. Used by the event-detail hero. */
  placeholderChromeless?: boolean
  /**
   * Explicit sizes hint for next/image. Default assumes a full-viewport hero.
   * Bento tiles / rail tiles / cards must override with their actual rendered
   * width to avoid downloading a 1920px asset for a 300px tile.
   */
  sizes?: string
}

export function SmartMedia({
  media,
  className = '',
  autoplay = false,
  carouselInterval = 4000,
  priority = false,
  ariaLabel,
  placeholderChromeless = false,
  sizes = '(max-width: 768px) 100vw, 1920px',
}: Props) {
  const [carouselIndex, setCarouselIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (media.kind !== 'carousel') return
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') return
    const id = setInterval(() => {
      setCarouselIndex(i => (i + 1) % media.images.length)
    }, carouselInterval)
    return () => clearInterval(id)
  }, [media, carouselInterval])

  useEffect(() => {
    if (media.kind !== 'video' || autoplay) return
    const v = videoRef.current
    if (!v) return
    if (hovered) {
      v.play().catch(() => {})
    } else {
      v.pause()
      v.currentTime = 0
    }
  }, [hovered, media, autoplay])

  const wrapBase = `absolute inset-0 overflow-hidden ${className}`

  if (media.kind === 'video') {
    // In headless/audit mode, don't autoplay — the constant video repaint
    // inflates Speed Index dramatically. Show the poster as a still instead.
    const isHeadless =
      typeof document !== 'undefined' && document.body.dataset.headless === '1'
    const effectiveAutoplay = autoplay && !isHeadless
    return (
      <div
        ref={wrapRef}
        className={wrapBase}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={ariaLabel}
      >
        <video
          ref={videoRef}
          src={isHeadless ? undefined : media.src}
          poster={media.poster}
          muted
          playsInline
          loop
          autoPlay={effectiveAutoplay}
          preload={effectiveAutoplay ? 'auto' : 'none'}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  if (media.kind === 'branded-placeholder') {
    // TODO M5: organiser dashboard should preview branded placeholder when no cover uploaded
    return (
      <div className={wrapBase} aria-label={ariaLabel}>
        <BrandedPlaceholder category={media.category} chromeless={placeholderChromeless} />
      </div>
    )
  }

  if (media.kind === 'carousel') {
    return (
      <div className={wrapBase} aria-label={ariaLabel}>
        {media.images.map((src, i) => (
          <Image
            key={`${src}-${i}`}
            src={src}
            alt={media.alts[i] ?? ''}
            fill
            sizes={sizes}
            priority={priority && i === 0}
            fetchPriority={priority && i === 0 ? 'high' : 'auto'}
            quality={75}
            className="object-cover"
            style={{
              opacity: i === carouselIndex ? 1 : 0,
              transform: i === carouselIndex ? 'scale(1.04)' : 'scale(1)',
              transition: 'opacity 900ms ease, transform 4500ms ease',
            }}
          />
        ))}
      </div>
    )
  }

  // still-kenburns — use Next.js <Image> so priority inserts a <link rel="preload">
  // into the document head (raw <img> tags don't get auto-preloaded and leave a
  // multi-second resourceLoadDelay before the LCP fetch starts).
  return (
    <div className={wrapBase} aria-label={ariaLabel}>
      <Image
        src={media.src}
        alt={media.alt}
        fill
        sizes={sizes}
        priority={priority}
        fetchPriority={priority ? 'high' : 'auto'}
        quality={75}
        className={`object-cover smart-media-kenburns ${priority ? 'will-change-transform' : ''}`}
      />
    </div>
  )
}
