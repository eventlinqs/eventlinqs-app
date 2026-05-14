'use client'

import { useEffect, useState } from 'react'

/**
 * useHeaderScrollState - sentinel-based scroll detection (Batch 9.1).
 *
 * Returns `true` when the user has scrolled past the sentinel element
 * mounted immediately after the header in the layout. Uses an
 * IntersectionObserver to avoid the per-frame cost of a scroll
 * listener. The sentinel is a 1px tall element; when it leaves the
 * viewport, scrollState is true.
 *
 * Resilient to:
 *   - Browsers without IntersectionObserver (defaults to false; State A).
 *   - Sentinel not yet mounted (falls through quietly).
 *
 * The hook does NOT cause re-renders per scroll frame. State only
 * changes when the sentinel crosses the viewport boundary - at most
 * twice per scroll session.
 */
export function useHeaderScrollState(sentinelId: string): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Bail out cleanly on browsers without IntersectionObserver. Initial
    // state is already false (State A); leaving it untouched is correct.
    if (typeof IntersectionObserver === 'undefined') return

    const sentinel = document.getElementById(sentinelId)
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sentinel visible -> we are AT the top -> scrolled = false.
        // Sentinel out of viewport -> we have scrolled past 80px ->
        // scrolled = true.
        setScrolled(!entry.isIntersecting)
      },
      {
        rootMargin: '0px',
        threshold: 0,
      },
    )
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [sentinelId])

  return scrolled
}
