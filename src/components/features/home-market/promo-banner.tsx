'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { HeroMedia } from '@/components/media/HeroMedia'
import { HeroCaption } from '@/components/media/hero-caption'
import { HERO_EYEBROW_PLATE } from '@/components/media/hero-photo-scrim'
import type { PromoSlide } from '@/lib/home/marketplace'

/**
 * THE PROMO BANNER (law 46; the design engine, section 1: "a promo banner (rotating, dots)"; site.html). A rounded band
 * inside the container, each slide a real page on a licensed library photograph, the words on the shared caption wash
 * (hero-text-over-a-photograph), the kicker on its own plate.
 *
 * The motion law of the app constitution, as the home's featured carousel holds it (FeaturedHeroClient.tsx):
 *   - slide 0 is server rendered with the one priority raster and is the only slide in layout until rotation arms, so
 *     it is the LCP candidate; the others mount and load lazily only once armed, after the paint;
 *   - rotation ARMS ONLY under html[data-motion="1"] (never for reduced motion or a headless audit), advances on the
 *     founder's tempo (4.8 s, his ruling of 12 July 2026) with an eased crossfade, and pauses on hover, touch and while
 *     anything inside holds focus; a manual move resets the timer;
 *   - the pause control (WCAG 2.2.2) is visible only on keyboard focus; the dots are 44 px targets.
 */
const ROTATE_MS = 4800

export function PromoBanner({ slides }: { slides: readonly PromoSlide[] }) {
  const [active, setActive] = useState(0)
  const [armed, setArmed] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [held, setHeld] = useState(false)
  const [focused, setFocused] = useState(false)
  const total = slides.length
  const multi = total > 1
  const goTo = useCallback((i: number) => setActive(((i % total) + total) % total), [total])
  const next = useCallback(() => goTo(active + 1), [active, goTo])

  useEffect(() => {
    if (!multi || typeof document === 'undefined' || document.documentElement.dataset.motion !== '1') return
    const raf = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(raf)
  }, [multi])

  useEffect(() => {
    if (!armed || !playing || held || focused || !multi) return
    const t = setTimeout(next, ROTATE_MS)
    return () => clearTimeout(t)
  }, [armed, playing, held, focused, active, next, multi])

  const touchX = useRef<number | null>(null)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!multi) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(active - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      next()
    }
  }

  if (total === 0) return null

  return (
    <div
      role={multi ? 'region' : undefined}
      aria-roledescription={multi ? 'carousel' : undefined}
      aria-label={multi ? 'What is on' : undefined}
      tabIndex={multi ? 0 : undefined}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null
        setHeld(true)
      }}
      onTouchEnd={(e) => {
        const start = touchX.current
        const end = e.changedTouches[0]?.clientX ?? null
        touchX.current = null
        setHeld(false)
        if (!multi || start === null || end === null || Math.abs(end - start) < 40) return
        if (end > start) goTo(active - 1)
        else next()
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      className="relative mt-5 h-[340px] overflow-hidden rounded-[22px] bg-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 md:h-[380px]"
    >
      {slides.map((s, i) => {
        const isActive = i === active
        const present = isActive || armed
        return (
          <div
            key={s.id}
            hidden={!present}
            aria-hidden={!isActive}
            {...(!isActive ? { inert: true } : {})}
            className={`absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none ${isActive ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <HeroMedia image={s.image} alt={s.alt} priority={i === 0} objectPosition={s.position ?? '50% 40%'} />
            <div className={`relative z-10 flex h-full items-end px-6 md:items-center md:px-12 ${multi ? 'pb-16 md:pb-0' : 'pb-8 md:pb-0'}`}>
              <HeroCaption wash="text-side" className="max-w-xl">
                <p
                  data-eyebrow-plate
                  className="inline-flex rounded-md px-2 py-0.5 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--brand-accent)]"
                  style={{ background: HERO_EYEBROW_PLATE, textShadow: 'none' }}
                >
                  {s.kicker}
                </p>
                <h2 className="mt-2 font-headline text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-5xl">
                  {s.title}
                  <span className="block text-[var(--brand-accent)]">{s.accent}</span>
                </h2>
                <p className="mt-2 max-w-md font-display text-base font-semibold text-white/90 md:text-lg">{s.body}</p>
                <Link
                  href={s.href}
                  prefetch={false}
                  className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--brand-accent)] px-6 font-display text-base font-extrabold text-[var(--color-navy-950)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
                >
                  {s.action}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </HeroCaption>
            </div>
          </div>
        )
      })}

      {multi ? (
        <>
          {armed ? (
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause automatic slideshow' : 'Play automatic slideshow'}
              className="sr-only items-center justify-center rounded-full bg-[var(--color-navy-950)] text-[var(--brand-accent)] focus-visible:not-sr-only focus-visible:absolute focus-visible:bottom-3 focus-visible:right-3 focus-visible:z-30 focus-visible:flex focus-visible:h-11 focus-visible:w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
            >
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            </button>
          ) : null}
          <div role="tablist" aria-label="Choose a slide" className="absolute bottom-2 left-4 z-20 flex items-center md:left-10">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Slide ${i + 1}: ${s.title} ${s.accent}`}
                onClick={() => goTo(i)}
                className="group/dot flex h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
              >
                <span
                  aria-hidden
                  className={`block h-2 rounded-full transition-all duration-200 motion-reduce:transition-none ${i === active ? 'w-6 bg-[var(--brand-accent)]' : 'w-2 bg-white/50 group-hover/dot:bg-white/75'}`}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
