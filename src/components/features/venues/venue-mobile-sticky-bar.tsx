'use client'

import { useEffect, useState } from 'react'

interface Props {
  venueName: string
}

/**
 * VenueMobileStickyBar - bottom-fixed gold-on-navy CTA bar for
 * <= 768px (Batch 8.3 VP9). Slides up after 200px scroll. Tap
 * smooth-scrolls to the upcoming-events rail.
 *
 * Sits above the global BottomNav (h-16 z-40) at bottom-16 z-50.
 */
export function VenueMobileStickyBar({ venueName }: Props) {
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
      className={[
        'fixed inset-x-0 bottom-16 z-50 md:hidden',
        'transition-transform duration-300 ease-out',
        shown ? 'translate-y-0' : 'translate-y-full',
      ].join(' ')}
    >
      <a
        href="#upcoming-events"
        className="flex h-[60px] w-full items-center justify-center gap-3 bg-[var(--color-navy-950)] px-5 text-[var(--brand-accent)] shadow-[0_-6px_20px_rgba(0,0,0,0.22)]"
      >
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[15px] font-bold tracking-tight">View {venueName} events &rarr;</span>
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
            Upcoming + past
          </span>
        </span>
      </a>
    </div>
  )
}
