'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
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

// Founder tempo ruling 2026-07-12: a confident, alive 4 to 5 second beat
// (6.5s sat static too long). The 700ms eased crossfade stays, so each
// slide holds just over four seconds before gliding on.
const ROTATE_MS = 4800

/**
 * FeaturedHeroClient - one strong featured event at a time, auto-rotating to the
 * 2026 standard (evidence: Humanitix hero auto-rotates with a pause control;
 * docs/benchmark/rail-controls/CATALOGUE.md).
 *
 * Auto-rotation (Hero Carousel law, CLAUDE.md Motion):
 *   - Advances every ~4.8s with an eased opacity crossfade, mobile and desktop.
 *   - Pauses on hover (desktop), touch/swipe (mobile), and while any element
 *     inside has keyboard focus; resumes after. A manual move resets the timer
 *     (the timer effect keys on `active`).
 *   - A pause/play control (WCAG 2.2.2) that is NEVER visible to mouse or touch
 *     on any viewport: visually hidden (sr-only) and revealed ONLY on keyboard
 *     focus (focus-visible). Hover/touch users get automatic pause-on-interaction,
 *     reduced-motion users get no rotation at all, so the hero carries zero
 *     visible playback chrome on any viewport (the industry-standard pattern).
 *   - ARMED ONLY under html[data-motion="1"] (set pre-paint for real visitors,
 *     never for prefers-reduced-motion or headless audits). So reduced-motion and
 *     audits get NO auto-rotation and manual nav only.
 *
 * LCP law: slide 0 is server-rendered with the priority raster and is the only
 * slide in layout until rotation arms (post-paint, in an effect), so it is the
 * clean LCP candidate. Non-first slides mount (and lazy-load) only once armed -
 * after the LCP window. Before arming, manual navigation still works: the
 * targeted slide enters layout on demand.
 */
export function FeaturedHeroClient({ slides }: Props) {
  const [active, setActive] = useState(0)
  const [armed, setArmed] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [touching, setTouching] = useState(false)
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

  // Arm auto-rotation post-paint, only when the motion flag is set (which is
  // never the case for prefers-reduced-motion or headless audits). The effect
  // runs after hydration - i.e. after the priority slide-0 raster has painted -
  // so arming (and mounting/lazy-loading the other slides) never touches LCP.
  useEffect(() => {
    if (!multi) return
    if (typeof document === 'undefined') return
    if (document.documentElement.dataset.motion !== '1') return
    const raf = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(raf)
  }, [multi])

  // Auto-advance. Keys on `active` so any manual move resets the timer. Paused
  // while hovered / focused-within / touching, or when the user has paused.
  useEffect(() => {
    if (!armed || !playing || hovered || focused || touching || !multi) return
    const t = setTimeout(next, ROTATE_MS)
    return () => clearTimeout(t)
  }, [armed, playing, hovered, focused, touching, active, next, multi])

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
    setTouching(true)
  }
  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current
    const end = e.changedTouches[0]?.clientX ?? null
    touchStartX.current = null
    setTouching(false)
    if (!multi || start === null || end === null) return
    const dx = end - start
    if (Math.abs(dx) < 40) return
    if (dx > 0) prev()
    else next()
  }

  // Founder directive 2026-07-05: the HOMEPAGE hero runs ~17% taller than the
  // platform .hero-marketing scale (42/44/48vh cap 480 -> 49/51/56vh cap 560).
  // Homepage only; every other hero stays on the platform token.
  return (
    <div
      role={multi ? 'region' : undefined}
      aria-roledescription={multi ? 'carousel' : undefined}
      aria-label={multi ? 'Featured events' : undefined}
      tabIndex={multi ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}
      className="group relative hero-marketing w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset"
    >
      {slides.map((slide, idx) => {
        const isActive = idx === active
        // In layout (image can load) when active, or once rotation is armed
        // (post-LCP). Otherwise display:none so its raster never loads early.
        const present = isActive || armed
        return (
          <div
            key={slide.id}
            hidden={!present}
            aria-hidden={!isActive}
            {...(!isActive ? { inert: true } : {})}
            className={`absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none ${isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
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
                  'linear-gradient(to top, rgba(10,22,40,0.84) 0%, rgba(10,22,40,0.54) 20%, rgba(10,22,40,0.24) 44%, rgba(10,22,40,0.06) 68%, rgba(10,22,40,0) 88%)',
              }}
            />
            <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
              {/* hero-enter staggers the content stack (kicker, title, detail,
               *  CTA) in on load, 60-80ms apart. hero-slide-content re-runs a
               *  single gentle rise when this slide becomes active during
               *  rotation, so each featured event arrives behind the crossfade.
               *  The HeroMedia LCP raster is a sibling above and is never
               *  animated (media architecture law). */}
              <div className={`max-w-2xl hero-enter hero-slide-content${isActive ? ' is-active' : ''}`}>
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
                    className="plausible-event-name=hero_get_tickets_click inline-flex h-12 items-center justify-center rounded-full bg-[var(--brand-accent)] px-7 text-[var(--color-navy-950)] shadow-lg shadow-black/30 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(212,164,55,0.32)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                    style={{ fontSize: 'var(--type-body)', fontWeight: 600, transition: 'transform var(--motion-quick), box-shadow var(--motion-quick)' }}
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
            className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(10,22,40,0.78)] text-white transition-colors duration-200 hover:bg-[rgba(10,22,40,0.92)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] md:flex"
            style={{ border: '1px solid rgba(212, 160, 23, 0.45)' }}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next event"
            className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(10,22,40,0.78)] text-white transition-colors duration-200 hover:bg-[rgba(10,22,40,0.92)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] md:flex"
            style={{ border: '1px solid rgba(212, 160, 23, 0.45)' }}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>

          {/* Pause/play control (WCAG 2.2.2): NEVER visible to mouse or touch on
           *  any viewport. Visually hidden (sr-only) and revealed ONLY on keyboard
           *  focus (focus-visible) as a solid navy/gold pill at the hero's
           *  bottom-right. Hover/touch users get automatic pause-on-interaction;
           *  reduced-motion users get no rotation; so the hero shows zero visible
           *  playback chrome (Hero Carousel law). Gated on `armed`: it exists only
           *  while auto-rotation is actually running. */}
          {armed && (
            <button
              type="button"
              onClick={() => setPlaying(p => !p)}
              aria-label={playing ? 'Pause automatic slideshow' : 'Play automatic slideshow'}
              className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:bottom-4 focus-visible:right-4 focus-visible:z-30 focus-visible:flex focus-visible:h-11 focus-visible:w-11 focus-visible:items-center focus-visible:justify-center focus-visible:rounded-full focus-visible:bg-[var(--color-ink-900)] focus-visible:text-[var(--brand-accent)] focus-visible:shadow-[0_2px_8px_rgba(10,22,40,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
              style={{ border: '1px solid rgba(212, 160, 23, 0.45)' }}
            >
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            </button>
          )}

          {/* Bottom control bar: minimal slide dots only - no visible pause chrome. */}
          <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3">
            <div role="tablist" aria-label="Choose featured event" className="flex items-center gap-1.5">
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
                    className="group/dot flex h-11 min-w-[24px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
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
          </div>
        </>
      )}
    </div>
  )
}
