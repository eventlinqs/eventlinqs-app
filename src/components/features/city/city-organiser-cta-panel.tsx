import Link from 'next/link'
import { CityNewsletterCapture } from './city-newsletter-capture'

interface Props {
  cityName: string
  citySlug: string
}

/**
 * CityOrganiserCtaPanel - dark navy panel that closes every city page.
 *
 * Two-column on desktop: left "Sell with us" with organiser benefits;
 * right newsletter capture for city event digest. Stacks on mobile.
 */
export function CityOrganiserCtaPanel({ cityName, citySlug }: Props) {
  return (
    <section
      aria-labelledby="city-cta-heading"
      className="relative overflow-hidden border-t border-ink-100 bg-[var(--surface-1)] py-12 sm:py-16 lg:py-20"
    >
      {/* Subtle warm gold tint - premium and light (Phase B touch) */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-30%', right: '-8%', width: '55%', height: '160%',
          background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 64%)',
          opacity: 0.05,
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              For organisers
            </p>
            <h2
              id="city-cta-heading"
              className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl"
            >
              Throwing an event in {cityName}? Reach every community across the city.
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-[var(--text-secondary)] sm:text-base">
              <li className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-accent)]" aria-hidden />
                <span>Transparent pricing - no hidden booking fees, no last-minute surprises.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-accent)]" aria-hidden />
                <span>WhatsApp-first share flows - your audience already lives there.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-accent)]" aria-hidden />
                <span>Squad bookings so the whole crew comes together in one transaction.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-accent)]" aria-hidden />
                <span>Real human support. We answer in hours, not days.</span>
              </li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/organisers?city=${citySlug}`}
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] transition hover:bg-[var(--brand-accent-strong)]"
              >
                Sell with us
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border border-ink-300 bg-transparent px-6 text-sm font-semibold text-ink-900 transition hover:bg-ink-100"
              >
                Talk to us
              </Link>
            </div>
          </div>
          <div className="flex items-center">
            <CityNewsletterCapture cityName={cityName} tone="light" />
          </div>
        </div>
      </div>
    </section>
  )
}
