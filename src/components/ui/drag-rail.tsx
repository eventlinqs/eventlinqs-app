'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useDragScroll } from '@/hooks/use-drag-scroll'

interface Props {
  children: ReactNode
  className?: string
  ariaLabel?: string
  testId?: string
  /**
   * When true, horizontal scroll-snap (x mandatory) is ARMED on the user's
   * first engagement with the rail rather than being active from first paint.
   * A statically-snapping container re-snaps every time a lazy card image loads
   * and reflows it, firing browser-induced scroll events that stop Chrome's LCP
   * recording before the rail's LCP card paints (the homepage/culture NO_LCP
   * class of defect; this rail's first card is the /events LCP candidate). Arming
   * on engage keeps that card a clean LCP candidate. Callers must NOT put
   * snap-x/snap-mandatory in className; cards keep their own snap-start.
   * See src/components/ui/snap-rail.tsx for the same fix on the other rail.
   */
  snap?: boolean
}

export function DragRail({ children, className = '', ariaLabel, testId, snap = false }: Props) {
  const ref = useRef<HTMLUListElement>(null)
  useDragScroll(ref)

  useEffect(() => {
    if (!snap) return
    const el = ref.current
    if (!el) return
    // Apply synchronously in the engage event so snap takes effect for that same
    // gesture; never on load, so the re-snap can never stop LCP.
    const arm = () => {
      el.style.scrollSnapType = 'x mandatory'
      cleanup()
    }
    function cleanup() {
      el?.removeEventListener('pointerdown', arm)
      el?.removeEventListener('wheel', arm)
      el?.removeEventListener('touchstart', arm)
      el?.removeEventListener('keydown', arm)
    }
    const opts = { passive: true, once: true } as const
    el.addEventListener('pointerdown', arm, opts)
    el.addEventListener('wheel', arm, opts)
    el.addEventListener('touchstart', arm, opts)
    el.addEventListener('keydown', arm, opts)
    return cleanup
  }, [snap])

  return (
    <ul
      ref={ref}
      aria-label={ariaLabel}
      data-testid={testId}
      onClickCapture={e => {
        const el = e.currentTarget as HTMLElement
        if (el.getAttribute('data-dragged') === 'true') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      className={className}
    >
      {children}
    </ul>
  )
}
