'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Client-side immediate redirect. Used by the artist share landing: link
 * preview crawlers need a 200 HTML response carrying the artist-variant OG
 * tags (a server redirect would hand them the event page's default card),
 * while a human tapping the link should land on the event page without
 * noticing the hop. The landing renders a visible link as the no-JS
 * fallback, so the hop is never a dead end.
 */
export function RedirectNow({ to }: { to: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(to)
  }, [router, to])
  return null
}
