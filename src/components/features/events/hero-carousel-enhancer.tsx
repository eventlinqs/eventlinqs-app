'use client'

import { useEffect, useState } from 'react'
import { HeroCarouselClient, type HeroCarouselSlide } from './hero-carousel-client'

/**
 * HeroCarouselEnhancer - sibling client component that mounts the interactive
 * carousel after first paint. Until then, the static FeaturedHeroStaticShell
 * (a sibling rendered FIRST in the DOM) owns the LCP element.
 *
 * Once mounted, sets `body[data-hero-enhanced="1"]`. A CSS rule in globals.css
 * hides the static shell, leaving only the interactive carousel.
 *
 * Why a sibling rather than a parent: a 'use client' wrapper that imports a
 * server-shaped child treats the child as part of its own client bundle, so
 * the LCP element ends up on the hydration path. As siblings under a server
 * parent, the shell has zero client boundary above it.
 */

interface Props {
  slides: HeroCarouselSlide[]
  liveEventCount: number
  uniqueCitiesCount: number
  subcopy: string
}

export function HeroCarouselEnhancer(props: Props) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') return

    let cancelled = false
    let cancelHandle: number | NodeJS.Timeout | null = null

    const mount = () => {
      if (cancelled) return
      document.body.dataset.heroEnhanced = '1'
      setActive(true)
    }

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    if (typeof w.requestIdleCallback === 'function') {
      cancelHandle = w.requestIdleCallback(mount, { timeout: 1500 })
    } else {
      cancelHandle = setTimeout(mount, 200)
    }

    return () => {
      cancelled = true
      if (cancelHandle != null) {
        if (typeof w.cancelIdleCallback === 'function' && typeof cancelHandle === 'number') {
          w.cancelIdleCallback(cancelHandle)
        } else {
          clearTimeout(cancelHandle as NodeJS.Timeout)
        }
      }
      delete document.body.dataset.heroEnhanced
    }
  }, [])

  if (!active) return null
  return <HeroCarouselClient {...props} />
}
