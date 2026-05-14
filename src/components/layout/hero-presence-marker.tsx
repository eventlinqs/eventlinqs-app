'use client'

import { useRegisterHero } from '@/hooks/use-hero-presence'

/**
 * HeroPresenceMarker - drop-in sibling of any <HeroMedia> usage
 * (Batch 9.1).
 *
 * Renders nothing. While mounted, registers with the
 * HeroPresenceProvider so the SiteHeader knows the current page has a
 * hero and starts in transparent State A. The header transitions to
 * State B once the user scrolls past the sentinel.
 *
 * Why a marker instead of wrapping HeroMedia: the brief locks
 * HeroMedia as DO NOT TOUCH. A composition wrapper would force every
 * caller to swap imports; a marker placed near each HeroMedia usage
 * is a one-line addition with zero risk to the LCP path.
 */
export function HeroPresenceMarker() {
  useRegisterHero()
  return null
}
