'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HeroMedia } from '@/components/media'

export interface FeaturedHeroSlide {
  id: string
  /** Small uppercase group label above the title (category name). */
  kicker: string
  title: string
  /** Single pre-composed detail line, e.g. "The Forum | Melbourne | Sat 14 Mar". */
  detailLine: string
  /** Event detail href. */
  href: string
  /** Real raster cover URL. */
  image: string
  alt: string
  objectPosition?: string
}

interface Props {
  slides: FeaturedHeroSlide[]
}

/**
 * FeaturedHeroClient - one strong featured event at a time, Ticketmaster /
 * Humanitix style. Manual navigation only (arrows, dots, swipe, keyboard);
 * NO auto-rotation and NO opacity crossfade - inactive slides are removed
 * from layout with `hidden` so the swap is instant and the active slide's
 * priority raster stays the clean LCP candidate.
 *
 * The hero is the ONLY surface on the homepage where text sits on a photo;
 * a restrained bottom-up navy scrim keeps the overlay legible.
 *
 * LCP discipline: slide 0 is server-rendered and the only one passing
 * priority to HeroMedia.
 */
export function FeaturedHeroClient({ slides }: Props) {
  const [active, setActive] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const liveRegionRef = useRef<HTMLDivElement>(null)

  const total = slides.length
  const multi = total > 1

  const goTo = useCallback(
    (idx: number) => setActive(((idx % total) + total) % total),
    [total],
  )
  const next = useCallback(() => goTo(active + 1), [active, goTo])
  const prev = useCallback(() => goTo(active - 1), [active, goTo])

  useEffect(() => {
    if (!liveRegionRef.current) return
    const slide = slides[active]
    if (slide) liveRegionRef.current.textContent = `Event ${active + 1} of ${total}: ${slide.title}`
  }, [active, slides, total])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!multi) return
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
    if (!multi || start === null || end === null) return
    const dx = end - start
    if (Math.abs(dx) < 40) return
    if (dx > 0) prev()
    else next()
  }

  return (
    <div
      role={multi ? 'region' : undefined}
      aria-roledescription={multi ? 'carousel' : undefined}
      aria-label={multi ? 'Featured events' : undefined}
      tabIndex={multi ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="group relative h-[42vh] min-h-[320px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset sm:h-[44vh] lg:h-[48vh] lg:max-h-[480px]"
    >
      {slides.map((slide, idx) => {
        const isActive = idx === active
        return (
          <div
            key={slide.id}
            hidden={!isActive}
            className="absolute inset-0"
          >
            <HeroMedia
              image={slide.image}
              alt={slide.alt}
              priority={idx === 0}
              objectPosition={slide.objectPosition}
            />
            {/* Restrained bottom-up scrim - just enough for legibility. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(10,22,40,0.80) 0%, rgba(10,22,40,0.40) 42%, rgba(10,22,40,0.06) 78%, rgba(10,22,40,0.00) 100%)',
              }}
            />
            <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
              <div className="max-w-2xl">
                <p
                  className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
                  style={{ fontWeight: 600 }}
                >
                  {slide.kicker}
                </p>
                <h2 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {slide.title}
                </h2>
                <p className="mt-2 text-sm text-white/85 sm:text-base">{slide.detailLine}</p>
                <div className="mt-5">
                  <Link
                    href={slide.href}
                    prefetch={false}
                    className="plausible-event-name=hero_get_tickets_click inline-flex h-12 items-center justify-center rounded-full bg-[var(--brand-accent)] px-7 text-[var(--color-navy-950)] shadow-lg shadow-black/30 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] motion-reduce:hover:scale-100"
                    style={{ fontSize: 'var(--type-body)', fontWeight: 600, transition: 'transform var(--motion-quick)' }}
                  >
                    Get tickets
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {multi && (
        <>
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

          <div
            role="tablist"
            aria-label="Choose featured event"
            className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-1.5"
          >
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
                      isActive
                        ? 'h-2 w-6 rounded-full bg-[var(--brand-accent)]'
                        : 'h-2 w-2 rounded-full bg-white/45 group-hover/dot:bg-white/70',
                    ].join(' ')}
                  />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
