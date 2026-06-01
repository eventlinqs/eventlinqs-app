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
  /**
   * Per-slot object-position override. Different photos in the Pexels
   * placeholder set have subjects sitting at different vertical points
   * in frame; this lets each slot tune its desktop crop so heads stay
   * visible and the title sits cleanly above the action. Defaults to
   * "50% 50%" inside HeroMedia when omitted.
   */
  objectPosition?: string
}

interface Props {
  slides: HeroSlide[]
}

const ROTATION_MS = 6000
const CROSSFADE_MS = 600

/**
 * HeroCarouselClient (Batch 11.0).
 *
 * Full-bleed rotating editorial carousel matching the DICE.fm and
 * Ticketmaster.com.au pattern, scoped to 5 AU friends-launch slots.
 *
 * Mechanics:
 *   - 6-second auto-rotation, 600ms crossfade transition
 *   - Pause on hover (desktop) and on focus-within (keyboard)
 *   - prefers-reduced-motion: reduce disables auto-rotation and
 *     crossfade, shows slide 0 statically, dots stay navigable
 *   - Keyboard: ArrowLeft/Right navigate, Space pauses/resumes
 *   - Mobile: native touch swipe (touchstart + touchend delta)
 *   - WAI-ARIA: role="region" + aria-roledescription="carousel" +
 *     aria-live="polite" announcer for slide changes
 *
 * LCP discipline: only the first slide passes `priority` to HeroMedia.
 * Slides 2-5 lazy-load.
 */
export function HeroCarouselClient({ slides }: Props) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [progressKey, setProgressKey] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const liveRegionRef = useRef<HTMLDivElement>(null)

  // Detect prefers-reduced-motion on mount (and listen for changes).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const total = slides.length
  const goTo = useCallback(
    (idx: number) => {
      setActive(((idx % total) + total) % total)
      setProgressKey(k => k + 1)
    },
    [total],
  )
  const next = useCallback(() => goTo(active + 1), [active, goTo])
  const prev = useCallback(() => goTo(active - 1), [active, goTo])

  // Auto-rotate while not paused and reduced-motion is off.
  useEffect(() => {
    if (paused || reducedMotion || total <= 1) return
    const id = setTimeout(() => next(), ROTATION_MS)
    return () => clearTimeout(id)
  }, [active, paused, reducedMotion, next, total])

  // Announce slide changes politely.
  useEffect(() => {
    if (!liveRegionRef.current) return
    const slide = slides[active]
    if (slide) {
      liveRegionRef.current.textContent = `Slide ${active + 1} of ${total}: ${slide.title}`
    }
  }, [active, slides, total])

  // Keyboard navigation on the carousel container.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      next()
    } else if (e.key === ' ') {
      e.preventDefault()
      setPaused(p => !p)
    }
  }

  // Native touch swipe for mobile.
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
      aria-label="Featured community events"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="group relative h-[70vh] min-h-[480px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] sm:h-[80vh] lg:h-screen lg:max-h-[840px]"
    >
      {/* Slide stack */}
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
                style={{
                  background:
                    'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',
                }}
              />
            )}
            {/* Gradient overlay per docs/M5-DESIGN-SPEC.md / Information
             *  architecture: "Hero band ... gradient overlay (navy ->
             *  transparent from bottom)". Bottom-anchored linear so the
             *  title sits on a darker band while the upper half of the
             *  photograph reads unobstructed. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(10,22,40,0.85) 0%, rgba(10,22,40,0.55) 35%, rgba(10,22,40,0.20) 65%, rgba(10,22,40,0.00) 100%)',
              }}
            />
            {/* Content block - bottom-left anchored. */}
            <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-16 sm:px-8 sm:pb-20 lg:px-24 lg:pb-28">
              <div className="max-w-3xl">
                {/* Kicker - per M5-DESIGN-SPEC.md Typography: --type-micro
                 *  (12px, weight 500), gold accent on dark surfaces. */}
                <p
                  className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
                  style={{ fontWeight: 600 }}
                >
                  {slide.kicker}
                </p>
                {/* Title - per M5-DESIGN-SPEC.md: --type-hero-display
                 *  (96px desktop / 48px mobile, weight 800). Serif
                 *  rejected by spec ("None of the four competitors use
                 *  serif"); using Manrope sans via .type-hero-display. */}
                <h2
                  className="type-hero-display font-headline mt-3 tracking-tight text-white sm:mt-4"
                >
                  {slide.title}
                </h2>
                {/* Subtitle - per M5-DESIGN-SPEC.md: --type-h3 (28px
                 *  desktop / 22px mobile, weight 600). */}
                <p className="type-h3 mt-4 text-white/90 sm:mt-5">
                  {slide.venue}
                  <span aria-hidden className="mx-2 text-white/40">|</span>
                  {slide.city}
                  <span aria-hidden className="mx-2 text-white/40">|</span>
                  {slide.date}
                </p>
                {/* CTAs - per M5-DESIGN-SPEC.md: "One primary CTA (gold),
                 *  one secondary (navy outline)". Gold primary to the
                 *  slot's event, navy/white-outline secondary to the
                 *  marketplace browse (supports the marketplace-breadth
                 *  positioning that distinguishes EventLinqs from DICE's
                 *  single-hero CTA approach). */}
                <div className="mt-8 flex flex-wrap items-center" style={{ gap: 'var(--space-element-gap)' }}>
                  <Link
                    href={slide.cta}
                    prefetch={false}
                    className="plausible-event-name=hero_get_tickets_click inline-flex h-14 items-center justify-center rounded-full bg-[var(--brand-accent)] px-7 text-[var(--color-navy-950)] shadow-lg shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(212,164,55,0.45)] motion-reduce:transition-none motion-reduce:hover:scale-100"
                    style={{
                      fontSize: 'var(--type-body)',
                      fontWeight: 600,
                      transition:
                        'transform var(--motion-quick), box-shadow var(--motion-quick)',
                    }}
                  >
                    Get tickets
                  </Link>
                  <Link
                    href="/events"
                    prefetch={false}
                    className="inline-flex h-14 items-center justify-center rounded-full border-2 border-white/80 px-7 text-white hover:border-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] motion-reduce:transition-none"
                    style={{
                      fontSize: 'var(--type-body)',
                      fontWeight: 600,
                      transition:
                        'background-color var(--motion-quick), border-color var(--motion-quick)',
                    }}
                  >
                    Browse all events
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Live region for slide announcements (screen readers). */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Arrow controls (desktop only). Hidden on touch via group-hover. */}
      <button
        type="button"
        onClick={prev}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(10,22,40,0.55)] text-white opacity-0 backdrop-blur-md transition-opacity duration-200 hover:bg-[rgba(10,22,40,0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] group-hover:opacity-100 group-focus-within:opacity-100 md:flex"
        style={{ border: '1px solid rgba(212, 164, 55, 0.45)' }}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(10,22,40,0.55)] text-white opacity-0 backdrop-blur-md transition-opacity duration-200 hover:bg-[rgba(10,22,40,0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] group-hover:opacity-100 group-focus-within:opacity-100 md:flex"
        style={{ border: '1px solid rgba(212, 164, 55, 0.45)' }}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      {/* Dot indicators (bottom-centre). Each button keeps a 24x24px
       *  invisible hit zone (axe target-size, WCAG 2.5.8) while the
       *  visible pill / dot stays tiny per the editorial aesthetic. */}
      <div
        role="tablist"
        aria-label="Slide selector"
        className="absolute inset-x-0 bottom-6 z-20 flex items-center justify-center gap-1 sm:bottom-8"
      >
        {slides.map((slide, idx) => {
          const isActive = idx === active
          return (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Slide ${idx + 1}: ${slide.title}`}
              onClick={() => goTo(idx)}
              className="group/dot flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
            >
              <span
                aria-hidden
                className={[
                  'block transition-all duration-300 motion-reduce:transition-none',
                  isActive
                    ? 'h-2 w-6 rounded-full bg-[var(--brand-accent)] sm:w-7'
                    : 'h-2 w-2 rounded-full bg-white/40 group-hover/dot:bg-white/60',
                ].join(' ')}
              />
            </button>
          )
        })}
      </div>

      {/* Progress bar (very bottom). Re-keyed per slide so the
       *  animation restarts cleanly. Suppressed under reduced-motion. */}
      {!reducedMotion ? (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 z-20 h-[2px] bg-white/10"
        >
          <div
            key={progressKey + '-' + (paused ? 'paused' : 'running')}
            className="h-full bg-[var(--brand-accent)]"
            style={{
              animation: paused
                ? 'none'
                : `el-hero-progress ${ROTATION_MS}ms linear forwards`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
