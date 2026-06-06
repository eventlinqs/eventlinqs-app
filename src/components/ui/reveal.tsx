'use client'

import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

/**
 * Reveal - the shared CSS-first scroll-reveal primitive (motion engine, per
 * CLAUDE.md). Wraps a block (or, with `stagger`, a row/grid container) and
 * fades it up as it enters the viewport, once, then unobserves.
 *
 * Progressive enhancement contract:
 *   The hidden initial state is armed in globals.css ONLY under
 *   html[data-motion="1"], which the pre-paint head bootstrap sets when JS is
 *   present, the agent is not a headless audit tool, and the user has not asked
 *   for reduced motion. So with no JS / reduced-motion / Lighthouse the content
 *   is fully visible from first paint and this component is a no-op. It never
 *   blocks reading and never costs LCP.
 *
 * Usage:
 *   <Reveal>            single block fade-rise on enter
 *   <Reveal stagger as="ul" className="grid ...">  direct children stagger
 *                       left to right (50-80ms apart), capped tail.
 */
type RevealProps = {
  /** Element to render. Default 'div'. Use the real container for `stagger`. */
  as?: ElementType
  /** Stagger direct children left to right instead of revealing as one block. */
  stagger?: boolean
  className?: string
  children: ReactNode
} & Record<string, unknown>

export function Reveal({ as, stagger = false, className = '', children, ...rest }: RevealProps) {
  const Tag = (as ?? 'div') as ElementType
  const [visible, setVisible] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const setRef = useCallback((node: Element | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node || typeof window === 'undefined') return

    const motionArmed =
      document.documentElement.dataset.motion === '1' && 'IntersectionObserver' in window

    // Not armed (no JS path is moot here, but: reduced-motion / headless /
    // unsupported) - show immediately, no animation.
    if (!motionArmed) {
      setVisible(true)
      return
    }

    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
            observerRef.current = null
            break
          }
        }
      },
      // Trigger a touch before the block is fully in view so the reveal reads
      // as part of the scroll, not after it lands.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    io.observe(node)
    observerRef.current = io
  }, [])

  useEffect(
    () => () => {
      if (observerRef.current) observerRef.current.disconnect()
    },
    [],
  )

  const base = stagger ? 'reveal-stagger' : 'reveal'
  const composed = [visible ? `${base} is-visible` : base, className].filter(Boolean).join(' ')

  return (
    <Tag ref={setRef} className={composed} {...rest}>
      {children}
    </Tag>
  )
}
