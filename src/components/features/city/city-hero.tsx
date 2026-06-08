import Link from 'next/link'
import { HeroMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'

/**
 * CityHero - Batch 6 hero band for /city/[slug] and /city/[slug]/[suburb].
 *
 * Mirrors PhotographicCultureHero: landscape Pexels photo behind a
 * left-anchored eyebrow + headline + subtitle, darkened bottom-up
 * gradient so text stays AA-readable, two CTAs anchored bottom-left.
 * Light primary surface picks up immediately below.
 *
 * Falls back to a navy-gradient band when no Pexels image is available.
 *
 * Live event count + organiser count are server-derived and threaded in
 * as text the hero composes into the eyebrow / subtitle line. The
 * "Browse all events" CTA scrolls down to the in-page events grid; the
 * "Sell tickets" CTA routes to /organisers.
 */

interface CityHeroProps {
  eyebrow: string
  title: string
  subtitle: string
  imageSrc: string | null
  /** ID on the in-page events grid that the primary CTA should anchor to. */
  eventsAnchorId?: string
  primaryCtaLabel: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  /** Optional small caption above the eyebrow (e.g. "12 upcoming events · 8 organisers"). */
  caption?: string
}

export function CityHero({
  eyebrow,
  title,
  subtitle,
  imageSrc,
  eventsAnchorId = 'all-events',
  primaryCtaLabel,
  secondaryCtaLabel,
  secondaryCtaHref,
  caption,
}: CityHeroProps) {
  return (
    <section
      aria-labelledby="city-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      {/* Single platform hero scale (.hero-marketing). Flattened from the old
       *  taller band: the 2026 competitor mirror shows TM/Eventbrite city and
       *  browse heroes sit at or below the homepage scale, not above it. */}
      <div className="hero-marketing relative w-full">
        {imageSrc ? (
          <HeroMedia image={imageSrc} alt={`${title} on EventLinqs`} priority />
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
        {/* Top scrim plus bottom-up navy ramp. Top scrim covers the
         *  header zone so the white sticky nav reads on bright sky
         *  photos. Fix from Batch 11.0 founder review. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.18) 12%, rgba(10,22,40,0.45) 45%, rgba(10,22,40,0.88) 100%)',
          }}
        />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-5 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <div className="max-w-3xl">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--brand-accent)] sm:text-xs">
              {eyebrow}
            </p>
            <h1
              id="city-hero-heading"
              className="mt-2 font-display text-[2.25rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] font-medium leading-relaxed text-white/90 sm:text-base">
              {subtitle}
            </p>
            {caption ? (
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85 sm:text-xs">
                {caption}
              </p>
            ) : null}
            {/* Mobile: stack CTAs full-width for 44px+ touch targets and
             *  a clearer primary action. Desktop: inline pill row. */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href={`#${eventsAnchorId}`}
                className="inline-flex h-12 min-w-[44px] items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] shadow-sm transition hover:bg-[var(--brand-accent-strong)] sm:h-11"
              >
                {primaryCtaLabel}
              </a>
              <Link
                href={secondaryCtaHref}
                className="inline-flex h-12 min-w-[44px] items-center justify-center rounded-full border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20 sm:h-11"
              >
                {secondaryCtaLabel}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
