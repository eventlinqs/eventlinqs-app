'use client'

import { useEffect, useState } from 'react'

interface Props {
  organiserName: string
}

/**
 * OrganiserMobileStickyBar - bottom-fixed gold-on-navy CTA bar for
 * <= 768px (Batch 8.2 OP10). Slides up after 200px scroll. Tap
 * smooth-scrolls to the contact / email-capture panel.
 *
 * Sits ABOVE the global BottomNav (z-40 h-16) at bottom-16 z-50, the
 * same pattern as MobileStickyBar on city pages.
 */
export function OrganiserMobileStickyBar({ organiserName }: Props) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div
      aria-hidden={!shown}
      // `inert` removes the focusable <a> below from the focus order
      // while the bar is hidden, satisfying axe-core's aria-hidden-focus
      // rule alongside the `aria-hidden` attribute (Batch 10 a11y fix).
      inert={!shown}
      className={[
        'fixed inset-x-0 bottom-16 z-50 md:hidden',
        'transition-transform duration-300 ease-out',
        // Hidden state translates beyond the 64px bottom nav so the bar
        // never overlaps it (Batch 10 a11y fix).
        shown ? 'translate-y-0' : 'translate-y-[calc(100%+4rem)]',
      ].join(' ')}
    >
      <a
        href="#stay-connected"
        className="flex h-[60px] w-full items-center justify-center gap-3 bg-[var(--color-navy-950)] px-5 text-[var(--brand-accent)] shadow-[0_-6px_20px_rgba(0,0,0,0.22)]"
      >
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[15px] font-bold tracking-tight">Get {organiserName} updates &rarr;</span>
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
            New events first
          </span>
        </span>
      </a>
    </div>
  )
}
