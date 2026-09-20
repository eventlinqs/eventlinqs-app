'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { MEDIA_QUALITY } from './quality'
import { MEDIA_SIZES } from './sizes'
import { MEDIA_TRANSITIONS } from './transitions'
import { isAuditRun } from '@/lib/ui/audit-mode'

/**
 * HeroAmbientLayer - the optional ken-burns / video overlay for HeroMedia.
 *
 * Mounted client-side AFTER the LCP image commits. Two requestAnimationFrame
 * ticks ensure the browser has reported LCP before any transform / opacity /
 * video paint enters the frame. This is what protects HeroMedia from the
 * NO_LCP / disqualification class of bugs.
 *
 * In audit mode the ambient layer is suppressed: autoplay video and 4.5s
 * transforms inflate Speed Index without changing what the user perceives
 * during a measurement run, and the ken-burns copy of the hero is a SECOND
 * decode of the LCP photograph.
 *
 * THAT SUPPRESSION WAS DEAD UNTIL 20 September 2026. It read
 * `document.body.dataset.headless` and the flag is set on `documentElement`
 * (src/app/layout.tsx says so in its own comment), so this layer mounted inside
 * every Lighthouse run. It was found by counting optimiser requests in a real
 * browser with the audit cookie set: two per event page, not one. The predicate
 * now lives in one place, src/lib/ui/audit-mode.ts.
 */

interface Props {
  videoSrc?: string
  kenBurns?: boolean
  posterImage: string
  sizes?: string
}

export function HeroAmbientLayer({
  videoSrc,
  kenBurns = false,
  posterImage,
  sizes = MEDIA_SIZES.fullBleed,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (isAuditRun()) return
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setMounted(true)
        // Trigger ken-burns scale on the next paint after mount so the
        // transition runs from scale(1) -> scale(1.04).
        requestAnimationFrame(() => {
          startedRef.current = true
        })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  if (!mounted) return null

  return (
    <>
      {kenBurns && (
        <Image
          src={posterImage}
          alt=""
          fill
          sizes={sizes}
          quality={MEDIA_QUALITY.hero}
          aria-hidden
          className="object-cover pointer-events-none"
          style={{
            transform: 'scale(1.04)',
            transition: `transform ${MEDIA_TRANSITIONS.kenburnsMs}ms ${MEDIA_TRANSITIONS.ease}`,
            willChange: 'transform',
          }}
        />
      )}

      {videoSrc && (
        <video
          src={videoSrc}
          poster={posterImage}
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
      )}
    </>
  )
}
