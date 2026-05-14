'use client'

import { useEffect } from 'react'
import { useHeroPresence } from '@/contexts/hero-presence-context'

/**
 * useRegisterHero - mount-lifetime registration with the
 * HeroPresenceProvider. Used by the thin composition wrapper around
 * <HeroMedia> so the actual HeroMedia component (DO NOT TOUCH) stays
 * untouched.
 *
 * Caller pattern:
 *
 *   import { HeroMedia } from '@/components/media'
 *   import { useRegisterHero } from '@/hooks/use-hero-presence'
 *
 *   export function HeroMediaTracked(props: ComponentProps<typeof HeroMedia>) {
 *     useRegisterHero()
 *     return <HeroMedia {...props} />
 *   }
 */
export function useRegisterHero(): void {
  const { registerHero, unregisterHero } = useHeroPresence()
  useEffect(() => {
    registerHero()
    return () => unregisterHero()
  }, [registerHero, unregisterHero])
}
