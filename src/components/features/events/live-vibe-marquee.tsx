'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDragScroll } from '@/hooks/use-drag-scroll'
import { EventCardMedia } from '@/components/media'
import { BrandedPlaceholder } from '@/components/ui/branded-placeholder'

/**
 * LiveVibeMarquee — deep navy editorial band of community event cards.
 *
 * Dark ink-950 band so the white elevated cards POP with heavy shadow.
 * Auto-scrolls left at ~80s/cycle via a requestAnimationFrame loop driving
 * scrollLeft (not a CSS transform) so the arrows + mouse drag + native
 * touch swipe all share the same motion dimension. Pauses on hover,
 * focus-within, or any user interaction (arrow click, drag). After 5s
 * of no interaction the loop resumes from the current scroll position.
 */

export type VibeImage = {
  id: string
  src: string | null
  href: string
  title: string
  community: string
  placeholderCategory?: string | null
}

interface Props {
  items: VibeImage[]
}

const AUTO_SCROLL_PX_PER_FRAME = 0.6
const RESUME_DELAY_MS = 5000
const CARD_STEP_PX = 296 // 280 card + 16 gap
const ARROW_SCROLL_DISTANCE = CARD_STEP_PX * 1.5

export function LiveVibeMarquee({ items }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const interactionTimerRef = useRef<number | null>(null)

  useDragScroll(scrollRef)

  const bumpInteraction = useCallback(() => {
    setIsInteracting(true)
    if (interactionTimerRef.current) window.clearTimeout(interactionTimerRef.current)
    interactionTimerRef.current = window.setTimeout(() => setIsInteracting(false), RESUME_DELAY_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (interactionTimerRef.current) window.clearTimeout(interactionTimerRef.current)
    }
  }, [])

  const isPaused = isHovered || isInteracting

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (isPaused) return
    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') return

    let rafId = 0
    const tick = () => {
      if (!el) return
      el.scrollLeft += AUTO_SCROLL_PX_PER_FRAME
      const half = el.scrollWidth / 2
      if (half > 0 && el.scrollLeft >= half) {
        el.scrollLeft -= half
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPaused])

  const scrollByCards = useCallback((direction: 1 | -1) => {
    bumpInteraction()
    scrollRef.current?.scrollBy({ left: direction * ARROW_SCROLL_DISTANCE, behavior: 'smooth' })
  }, [bumpInteraction])

  if (items.length === 0) return null
  const doubled = [...items, ...items]

  return (
    <section
      aria-labelledby="live-vibe-heading"
      className="overflow-hidden bg-ink-950 py-16 sm:py-20"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-500 opacity-80" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-coral-500" />
              </span>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-400">
                Live on EventLinqs
              </p>
            </div>
            <h2
              id="live-vibe-heading"
              className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl"
            >
              Community events across Australia
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">
              Real events, real organisers, real communities. This is what&apos;s happening right now.
            </p>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              aria-label="Scroll community events left"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/5 text-white transition-colors hover:border-gold-400 hover:bg-white/10 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              aria-label="Scroll community events right"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/5 text-white transition-colors hover:border-gold-400 hover:bg-white/10 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        id="rail-live-vibe"
        role="region"
        aria-label="Community events marquee"
        onPointerDown={(e) => { if (e.pointerType === 'mouse') bumpInteraction() }}
        onClickCapture={(e) => {
          const el = e.currentTarget as HTMLElement
          if (el.getAttribute('data-dragged') === 'true') {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        className="mt-8 overflow-x-auto scrollbar-none"
      >
        <div className="flex w-max gap-4 px-4 sm:px-6 lg:px-8">
          {doubled.map((item, i) => (
            <Link
              key={`${item.id}-${i}`}
              href={item.href}
              className="group relative flex h-[260px] w-[280px] flex-shrink-0 flex-col overflow-hidden rounded-lg bg-white shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,0.7),_0_0_0_1px_rgba(212,160,23,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-100">
                {item.src ? (
                  <EventCardMedia
                    src={item.src}
                    alt={item.title}
                    variant="marquee"
                    className="transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <BrandedPlaceholder category={item.placeholderCategory ?? null} />
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gold-700">
                  {item.community}
                </p>
                <p className="mt-1.5 line-clamp-2 whitespace-normal text-sm font-semibold leading-snug text-ink-900">
                  {item.title}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
