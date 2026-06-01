'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HeroMedia } from '@/components/media'

export interface HeroSlide {
  id: string
  kicker: string
  title: string
  venue: string
  city: string
  date: string
  cta: string
  cultureSlug: string
  image: string | null
  objectPosition?: string
}

interface Props {
  slides: HeroSlide[]
}

const CROSSFADE_MS = 350

/**
 * HeroCarouselClient - short, clean, single-feature hero (Ticketmaster /
 * Humanitix style). One strong featured event at a time, manual navigation
 * only: arrows, subtle dots, swipe and keyboard. No auto-rotation, no
 * rolling progress bar. Height is roughly half the old full-bleed treatment
 * and the title is dialled back so the hero reads as a confident banner.
 *
 * LCP discipline: only the first slide passes priority to HeroMedia.
 */
export function HeroCarouselClient({ slides }: Props) {
  const [active, setActive] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const liveRegionRef = useRef<HTMLDivElement>(null)

  const total = slides.length
  const goTo = useCallback(
    (idx: number) => setActive(((idx % total) + total) % total),
    [total],
  )
  const next = useCallback(() => goTo(active + 1), [active, goTo])
  const prev = useCallback(() => goTo(active - 1), [active, goTo])

  useEffect(() => {
    if (!liveRegionRef.current) return
    const slide = slides[active]
    if (slide) liveRegionRef.current.textContent = `Slide ${active + 1} of ${total}: ${slide.title}`
  }, [active, slides, total])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      next()
    }
  }
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current
    const end = e.changedTouches[0]?.clientX ?? null
    touchStartX.current = null
    if (start === null || end === null) return
    const dx = end - start
    if (Math.abs(dx) < 40) return
    if (dx > 0) prev()
    else next()
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured event"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="group relative h-[42vh] min-h-[320px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] sm:h-[46vh] lg:h-[52vh] lg:max-h-[520px]"
    >
      {slides.map((slide, idx) => {
        const isActive = idx === active
        return (
          <div
            key={slide.id}
            aria-hidden={!isActive}
            inert={!isActive}
            className={[
              'absolute inset-0 transition-opacity motion-reduce:transition-none',
              isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none',
            ].join(' ')}
            style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
          >
            {slide.image ? (
              <HeroMedia
                image={slide.image}
                alt={`${slide.title}, ${slide.venue}, ${slide.city}, ${slide.date}`}
                priority={idx === 0}
                objectPosition={slide.objectPosition}
              />
            ) : (
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)' }}
              />
            )}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(10,22,40,0.82) 0%, rgba(10,22,40,0.45) 45%, rgba(10,22,40,0.10) 80%, rgba(10,22,40,0.00) 100%)' }}
            />
            <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 sm:px-8 sm:pb-10 lg:px-24 lg:pb-12">
              <div className="max-w-2xl">
                <p className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]" style={{ fontWeight: 600 }}>
                  {slide.kicker}
                </p>
                <h2 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {slide.title}
                </h2>
                <p className="mt-2 text-sm text-white/85 sm:text-base">
                  {slide.venue}
                  <span aria-hidden className="mx-2 text-white/40">|</span>
                  {slide.city}
                  <span aria-hidden className="mx-2 text-white/40">|</span>
                  {slide.date}
                </p>
                <div className="mt-5 flex flex-wrap items-center" style={{ gap: 'var(--space-element-gap)' }}>
                  <Link
                    href={slide.cta}
                    prefetch={false}
                    className="plausible-event-name=hero_get_tickets_click inline-flex h-12 items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-[var(--color-navy-950)] shadow-lg shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] hover:scale-[1.02] motion-reduce:hover:scale-100"
                    style={{ fontSize: 'var(--type-body)', fontWeight: 600, transition: 'transform var(--motion-quick)' }}
                  >
                    Get tickets
                  </Link>
                  <Link
                    href="/events"
                    prefetch={false}
                    className="inline-flex h-12 items-center justify-center rounded-full border-2 border-white/80 px-6 text-white hover:border-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
                    style={{ fontSize: 'var(--type-body)', fontWeight: 600 }}
                  >
                    Browse all events
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <div ref={liveRegionRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

      <button
        type="button"
        onClick={prev}
        aria-label="Previous event"
        className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(10,22,40,0.55)] text-white backdrop-blur-md transition-colors duration-200 hover:bg-[rgba(10,22,40,0.78)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] md:flex"
        style={{ border: '1px solid rgba(212, 164, 55, 0.45)' }}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next event"
        className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(10,22,40,0.55)] text-white backdrop-blur-md transition-colors duration-200 hover:bg-[rgba(10,22,40,0.78)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] md:flex"
        style={{ border: '1px solid rgba(212, 164, 55, 0.45)' }}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      <div role="tablist" aria-label="Choose featured event" className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-1.5">
        {slides.map((slide, idx) => {
          const isActive = idx === active
          return (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Event ${idx + 1}: ${slide.title}`}
              onClick={() => goTo(idx)}
              className="group/dot flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
            >
              <span
                aria-hidden
                className={[
                  'block transition-all duration-200 motion-reduce:transition-none',
                  isActive ? 'h-2 w-6 rounded-full bg-[var(--brand-accent)]' : 'h-2 w-2 rounded-full bg-white/45 group-hover/dot:bg-white/70',
                ].join(' ')}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
