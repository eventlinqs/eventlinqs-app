import Link from 'next/link'
import type { HeroCarouselSlide } from './hero-carousel-client'

/**
 * FeaturedHeroStaticShell - server-rendered, zero-client first-paint hero.
 *
 * Renders slide 0 of the home hero with the LCP background image, foreground
 * H1/eyebrow/subcopy/CTAs, and ribbon card. Has no client boundary on its
 * render path so the LCP element commits immediately on first paint.
 *
 * Hidden via CSS (`body[data-hero-enhanced="1"] [data-hero-shell]`) once the
 * sibling HeroCarouselEnhancer mounts the interactive carousel.
 */

interface Props {
  slide: HeroCarouselSlide
  liveEventCount: number
  uniqueCitiesCount: number
  subcopy: string
  showIndicators: boolean
  totalSlides: number
}

export function FeaturedHeroStaticShell({
  slide,
  liveEventCount,
  uniqueCitiesCount,
  subcopy,
  showIndicators,
  totalSlides,
}: Props) {
  return (
    <section
      data-hero-shell
      aria-label="Featured events"
      className="relative flex min-h-[600px] items-end overflow-hidden bg-navy-950 md:min-h-[90vh]"
    >
      <div className="absolute inset-0">
        <div className="absolute inset-0">{slide.background}</div>
      </div>

      <div
        className="absolute inset-0 pointer-events-none hidden lg:block"
        style={{
          background:
            'radial-gradient(ellipse 50% 70% at 85% 70%, rgba(10,14,26,0.55) 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-24 pt-16 sm:px-6 lg:px-8 lg:pb-28">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="mx-auto max-w-2xl text-center sm:mx-0 sm:text-left">
            <div className="flex justify-center sm:justify-start">
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-400">
                {slide.eyebrow}
              </p>
            </div>
            <h1
              className="mt-4 font-display font-extrabold leading-[0.95] tracking-tight text-white"
              style={{ fontSize: 'clamp(2.25rem, 8vw, 6rem)' }}
            >
              Every <span className="text-gold-400">culture</span>. Every event. One platform.
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
                href={slide.primaryHref}
                className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-gold-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-gold-600 hover:shadow-gold-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                {slide.primaryLabel}
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center rounded-lg border border-white/25 bg-white/5 px-6 py-3 text-base font-semibold text-white backdrop-blur-md transition-colors duration-200 hover:border-white/50 hover:bg-white/10"
              >
                Browse all events
              </Link>
            </div>
          </div>

          {slide.card && (
            <div className="hidden w-full max-w-sm shrink-0 lg:block">{slide.card}</div>
          )}
        </div>

        {showIndicators && totalSlides > 1 && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-8 z-20 flex justify-center gap-1 sm:bottom-10"
          >
            {Array.from({ length: totalSlides }).map((_, i) => (
              <span
                key={i}
                className={[
                  'block h-1.5 rounded-full',
                  i === 0 ? 'w-8 bg-gold-400' : 'w-2 bg-white/40',
                ].join(' ')}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
