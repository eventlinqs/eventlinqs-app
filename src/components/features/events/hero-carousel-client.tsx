'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { MEDIA_TRANSITIONS } from '@/components/media'

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
function getReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function getServerReducedMotion(): boolean {
  return false
}

/**
 * HeroCarouselClient — rotating stage for the cinematic homepage hero.
 *
 * - Auto-advance every 7s; pauses on hover, focus-within, or prefers-reduced-motion.
 * - Cross-fades backgrounds; swaps foreground (eyebrow + CTA + card) per slide.
 * - Dot indicators centred-bottom; prev/next arrows at md+ only.
 * - Keyboard: arrows on focused region advance/retreat.
 *
 * Rendering model: server pre-renders each slide's `background` and `card` JSX
 * with media already resolved. We stack all backgrounds (opacity crossfade) but
 * only mount the active slide's card to avoid duplicate interactive targets.
 */

export interface HeroCarouselSlide {
  key: string
  eyebrow: string
  background: ReactNode
  card: ReactNode | null
  primaryHref: string
  primaryLabel: string
}

interface Props {
  slides: HeroCarouselSlide[]
  liveEventCount: number
  uniqueCitiesCount: number
  subcopy: string
}

const AUTO_ADVANCE_MS = 7000

export function HeroCarouselClient({
  slides,
  liveEventCount,
  uniqueCitiesCount,
  subcopy,
}: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  // Defer mounting non-priority slide backgrounds until after first paint.
  // This is what makes LCP anchorable on the homepage: when every slide is
  // stacked at opacity 0/1 in the initial DOM, Lighthouse thrashes between
  // LCP candidates and eventually reports NO_LCP. By mounting only slide 0
  // on first paint and mounting slides 1+ after ~1.6s, the browser has
  // already reported a stable LCP for slide 0 before the stack arrives.
  const [otherBgsMounted, setOtherBgsMounted] = useState(false)
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  )
  const sectionRef = useRef<HTMLElement>(null)

  const count = slides.length

  useEffect(() => {
    if (count <= 1) return
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') return
    if (reducedMotion) return
    const id = window.setTimeout(() => setOtherBgsMounted(true), 1600)
    return () => window.clearTimeout(id)
  }, [count, reducedMotion])

  useEffect(() => {
    if (count <= 1 || paused || reducedMotion) return
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % count)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(id)
  }, [count, paused, reducedMotion])

  const goTo = useCallback((next: number) => {
    setIndex(((next % count) + count) % count)
  }, [count])

  const goPrev = useCallback(() => goTo(index - 1), [goTo, index])
  const goNext = useCallback(() => goTo(index + 1), [goTo, index])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (count <= 1) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goNext()
    }
  }, [count, goPrev, goNext])

  const active = slides[index]

  return (
    <section
      ref={sectionRef}
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label="Featured events"
      className="relative flex min-h-[600px] items-end overflow-hidden bg-navy-950 md:min-h-[90vh] group/hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!sectionRef.current?.contains(e.relatedTarget as Node)) setPaused(false)
      }}
      onKeyDown={onKeyDown}
    >
      {/* Slide 0 is always the base layer — rendered as a bare wrapper with
          NO opacity, NO transition class, NO inline style. Lighthouse's LCP
          observer needs a stable, unambiguous candidate on initial paint;
          any `transition-opacity` or inline `opacity` on an ancestor of the
          hero image was causing NO_LCP even with transitions disabled in
          headless mode. Slides 1+ stack on top post-paint and cover it when
          active. When index returns to 0, slides 1+ fade to opacity 0 and
          reveal slide 0 again. */}
      <div className="absolute inset-0">
        <div className="absolute inset-0" aria-hidden={index !== 0}>
          {slides[0].background}
        </div>
        {otherBgsMounted && slides.slice(1).map((slide, i) => {
          const realIndex = i + 1
          return (
            <div
              key={slide.key}
              aria-hidden={realIndex !== index}
              className="absolute inset-0"
              style={{
                opacity: realIndex === index ? 1 : 0,
                transition: `opacity ${MEDIA_TRANSITIONS.heroCarouselFadeMs}ms ease-out`,
              }}
            >
              {slide.background}
            </div>
          )
        })}
      </div>

      {/* Radial darkening behind the ribbon card — floats card regardless of active media */}
      <div
        className="absolute inset-0 pointer-events-none hidden lg:block"
        style={{
          background:
            'radial-gradient(ellipse 50% 70% at 85% 70%, rgba(10,14,26,0.55) 0%, transparent 70%)',
        }}
        aria-hidden
      />

      {/* Foreground content */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-24 pt-16 sm:px-6 lg:px-8 lg:pb-28">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div
            key={`fg-${active.key}`}
            className="mx-auto max-w-2xl animate-fade-rise text-center sm:mx-0 sm:text-left"
          >
            <div className="flex justify-center sm:justify-start">
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-400">
                {active.eyebrow}
              </p>
            </div>
            <h1
              className="mt-4 font-display font-extrabold leading-[0.95] tracking-tight text-white"
              style={{ fontSize: 'clamp(2.25rem, 8vw, 6rem)' }}
            >
              Where the <span className="text-gold-400">culture</span> gathers.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/80 sm:text-lg">{subcopy}</p>

            {liveEventCount >= 10 && (
              <div className="mt-4 flex items-center justify-center gap-2.5 text-[13px] font-medium text-white/75 sm:justify-start">
                <span className="relative h-2 w-2 rounded-full bg-gold-400">
                  <span className="absolute inset-0 rounded-full bg-gold-400 opacity-60 animate-ping" />
                </span>
                {liveEventCount} events live now
                <span className="h-3 w-px bg-white/30" />
                {uniqueCitiesCount} {uniqueCitiesCount === 1 ? 'city' : 'cities'}
                <span className="h-3 w-px bg-white/30" />
                This week
              </div>
            )}

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-start sm:justify-start">
              <Link
                href={active.primaryHref}
                className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-gold-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-gold-600 hover:shadow-gold-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                {active.primaryLabel}
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center rounded-lg border border-white/25 bg-white/5 px-6 py-3 text-base font-semibold text-white backdrop-blur-md transition-colors duration-200 hover:border-white/50 hover:bg-white/10"
              >
                Browse all events
              </Link>
            </div>
          </div>

          {active.card && (
            <div key={`card-${active.key}`} className="hidden w-full max-w-sm shrink-0 animate-fade-rise lg:block">
              {active.card}
            </div>
          )}
        </div>

        {count > 1 && (
          <>
            {/* Dot indicators */}
            <div
              role="tablist"
              aria-label="Hero slide selector"
              className="absolute inset-x-0 bottom-8 z-20 flex justify-center gap-1 sm:bottom-10"
            >
              {slides.map((slide, i) => (
                <button
                  key={slide.key}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Show slide ${i + 1} of ${count}`}
                  onClick={() => goTo(i)}
                  className="flex h-6 min-w-[24px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
                >
                  <span
                    aria-hidden
                    className={[
                      'block h-1.5 rounded-full transition-all duration-300',
                      i === index ? 'w-8 bg-gold-400' : 'w-2 bg-white/40 group-hover:bg-white/60',
                    ].join(' ')}
                  />
                </button>
              ))}
            </div>

            {/* Prev / next arrows — md+ only */}
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md opacity-0 transition-all duration-200 group-hover/hero:opacity-100 hover:border-white/40 hover:bg-white/20 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:flex lg:left-6"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md opacity-0 transition-all duration-200 group-hover/hero:opacity-100 hover:border-white/40 hover:bg-white/20 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:flex lg:right-6"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>
    </section>
  )
}
