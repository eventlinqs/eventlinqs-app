'use client'

import { useEffect, useState } from 'react'

interface Props {
  cityName: string
  weekendCount: number
  /** Anchor of the in-page events grid the bar should scroll to. */
  anchorId?: string
}

/**
 * MobileStickyBar - bottom-fixed gold-on-navy CTA bar for ≤ 768px.
 *
 * Slides up after the user scrolls 200px past the hero. Stays visible
 * thereafter. Tap → smooth-scroll to the in-page All Events grid.
 * Safe-area-inset-bottom padding handles iPhone X+ notch.
 *
 * Pattern: standard mobile e-commerce sticky CTA. Hidden on >= md
 * viewports because the desktop hero CTAs are already visible above
 * the fold.
 */
export function MobileStickyBar({ cityName, weekendCount, anchorId = 'all-events' }: Props) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setShown(window.scrollY > 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      aria-hidden={!shown}
      // `inert` removes the element subtree from the focus order AND
      // disables interaction while hidden. Required alongside
      // `aria-hidden` to satisfy axe-core's aria-hidden-focus rule
      // (Batch 10 a11y fix); without `inert`, the focusable <a> below
      // remains tab-reachable while the wrapper is aria-hidden.
      inert={!shown}
      className={[
        // Sits ABOVE the global BottomNav (which is fixed bottom-0 h-16
        // z-40 md:hidden). bottom-16 stacks the sticky CTA on top of it
        // so both are visible without overlap.
        'fixed inset-x-0 bottom-16 z-50 md:hidden',
        'transition-transform duration-300 ease-out',
        // Hidden state translates BEYOND the bottom nav (60px own height
        // + 64px nav height = 124px). `translate-y-full` alone would
        // only push 60px down, leaving the bar overlapping the bottom
        // nav and obscuring its touch targets (Batch 10 a11y fix:
        // axe-core target-size rule).
        shown ? 'translate-y-0' : 'translate-y-[calc(100%+4rem)]',
      ].join(' ')}
    >
      <a
        href={`#${anchorId}`}
        className="flex h-[60px] w-full items-center justify-center gap-3 bg-[var(--color-navy-950)] px-5 text-[var(--brand-accent)] shadow-[0_-6px_20px_rgba(0,0,0,0.22)]"
      >
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[15px] font-bold tracking-tight">Browse all {cityName} events &rarr;</span>
          {weekendCount > 0 ? (
            <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
              {weekendCount} this weekend
            </span>
          ) : (
            <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
              See what&apos;s on
            </span>
          )}
        </span>
      </a>
    </div>
  )
}
