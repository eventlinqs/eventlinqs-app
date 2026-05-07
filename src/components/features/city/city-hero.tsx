import Link from 'next/link'
import { HeroMedia } from '@/components/media'

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
      <div className="relative h-[52vh] min-h-[360px] max-h-[520px] w-full">
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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.10) 0%, rgba(10,22,40,0.45) 45%, rgba(10,22,40,0.85) 100%)',
          }}
        />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <div className="max-w-3xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-white/85">
              {eyebrow}
            </p>
            <h1
              id="city-hero-heading"
              className="mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/85 sm:text-base">
              {subtitle}
            </p>
            {caption ? (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                {caption}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={`#${eventsAnchorId}`}
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] shadow-sm transition hover:bg-[var(--brand-accent-strong)]"
              >
                {primaryCtaLabel}
              </a>
              <Link
                href={secondaryCtaHref}
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
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
