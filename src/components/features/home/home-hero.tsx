import Link from 'next/link'
import { EventCardMedia } from '@/components/media'
import { BrandedPlaceholder } from '@/components/media'
import { getEventMedia, type EventMediaInput } from '@/lib/images/event-media'
import type { FeaturedHeroEvent } from '@/components/features/events/featured-event-hero'

/**
 * HomeHero - light-background, separated-card hero for the homepage.
 *
 * Replaces the full-bleed cinematic dark hero. Pattern:
 *   LEFT (lg-7) : eyebrow, H1 brand promise, value subcopy, two CTAs.
 *   RIGHT (lg-5): featured event card with image at top, content below.
 *
 * No text-over-photo overlay. No trust badges. No stat counter strip.
 * Primary CTA is navy on light surface; secondary is outline.
 *
 * The H1 is the locked brand promise. The right card surfaces the single
 * highest-scored upcoming event so the hero feels alive, not generic.
 */

interface Props {
  featuredEvent: FeaturedHeroEvent | null
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatFromPrice(tiers: FeaturedHeroEvent['ticket_tiers']): string | null {
  if (!tiers || tiers.length === 0) return null
  const cheapest = tiers.reduce((m, t) => (t.price < m.price ? t : m), tiers[0])
  if (cheapest.price === 0) return 'Free entry'
  const dollars = cheapest.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${cheapest.currency ?? 'AUD'} ${formatted}`
}

const CULTURE_PILLS = [
  'Afrobeats',
  'Caribbean',
  'Bollywood',
  'Latin',
  'Filipino',
  'Lunar',
  'Gospel',
  'Amapiano',
  'K-Pop',
  'Reggae',
]

export async function HomeHero({ featuredEvent }: Props) {
  let cardMedia:
    | { src: string; alt: string; isPlaceholder: boolean }
    | null = null

  if (featuredEvent) {
    const media = await getEventMedia(featuredEvent as EventMediaInput)
    if (media.kind === 'still-kenburns') {
      cardMedia = { src: media.src, alt: media.alt, isPlaceholder: false }
    } else if (media.kind === 'carousel' && media.images.length > 0) {
      cardMedia = {
        src: media.images[0],
        alt: media.alts[0] ?? (featuredEvent.title ?? 'Event'),
        isPlaceholder: false,
      }
    } else if (media.kind === 'video') {
      cardMedia = {
        src: media.poster,
        alt: (featuredEvent.title ?? 'Event'),
        isPlaceholder: false,
      }
    } else {
      cardMedia = { src: '', alt: (featuredEvent.title ?? 'Event'), isPlaceholder: true }
    }
  }

  const price = featuredEvent
    ? formatFromPrice(featuredEvent.ticket_tiers ?? null)
    : null

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative overflow-hidden bg-[var(--surface-0)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(212,164,55,0.10) 0%, rgba(212,164,55,0) 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(10,22,40,0.06) 0%, rgba(10,22,40,0) 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20 lg:px-8 lg:pt-20 lg:pb-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7 lg:pt-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-px w-10 bg-[var(--brand-accent)]"
              />
              <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-accent)]">
                Every culture. Every event. One platform.
              </p>
            </div>

            <h1
              id="home-hero-heading"
              className="mt-5 font-display font-extrabold leading-[1.05] tracking-tight text-[var(--text-primary)]"
              style={{ fontSize: 'clamp(2.25rem, 5.4vw, 4.25rem)' }}
            >
              The ticketing platform built for every culture.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
              All-in pricing from the first click. Guest checkout in two
              taps. Discovery built around the cultural rhythms your city
              actually celebrates, not generic genre buckets.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/events"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-[var(--color-navy-950)] px-7 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-ink-900)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
              >
                Browse events
              </Link>
              <Link
                href="/organisers"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] px-7 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
              >
                Sell tickets
              </Link>
            </div>

            <ul className="mt-10 flex flex-wrap gap-2">
              {CULTURE_PILLS.map(culture => (
                <li
                  key={culture}
                  className="inline-flex h-7 items-center rounded-full border border-[var(--surface-2)] bg-[var(--surface-1)] px-3 text-xs font-medium text-[var(--text-secondary)]"
                >
                  {culture}
                </li>
              ))}
              <li className="inline-flex h-7 items-center text-xs font-medium text-[var(--text-secondary)]">
                and 8 more
              </li>
            </ul>
          </div>

          <div className="lg:col-span-5">
            {featuredEvent ? (
              <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-sm transition-shadow hover:shadow-lg">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-1)]">
                  {cardMedia && !cardMedia.isPlaceholder ? (
                    <EventCardMedia
                      src={cardMedia.src}
                      alt={cardMedia.alt}
                      variant="card"
                      priority
                    />
                  ) : (
                    <BrandedPlaceholder />
                  )}
                  <div className="absolute left-4 top-4">
                    <span className="inline-flex h-7 items-center rounded-full bg-[var(--surface-0)]/95 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)] shadow-sm">
                      Featured tonight
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
                    {formatLongDate(featuredEvent.start_date)}
                  </p>
                  <h2 className="mt-2 line-clamp-2 font-display text-xl font-bold leading-snug text-[var(--text-primary)]">
                    {(featuredEvent.title ?? 'Event')}
                  </h2>
                  <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                    {featuredEvent.venue_name && (
                      <p className="line-clamp-1">
                        {featuredEvent.venue_name}
                        {featuredEvent.venue_city
                          ? ` · ${featuredEvent.venue_city}`
                          : ''}
                      </p>
                    )}
                    {featuredEvent.organisation?.name && (
                      <p className="text-[var(--text-muted)]">
                        by {featuredEvent.organisation.name}
                      </p>
                    )}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    {price && (
                      <p className="font-display text-lg font-bold text-[var(--text-primary)]">
                        {price}
                      </p>
                    )}
                    <Link
                      href={`/events/${featuredEvent.slug}`}
                      className="ml-auto inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-ink-900)]"
                    >
                      View event
                    </Link>
                  </div>
                </div>
              </article>
            ) : (
              <div className="flex h-full flex-col items-start justify-center rounded-2xl border border-dashed border-[var(--surface-2)] bg-[var(--surface-1)] p-8">
                <p className="font-display text-base font-bold text-[var(--text-primary)]">
                  Events loading soon
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  The first organisers are getting set up. Check back
                  shortly.
                </p>
                <Link
                  href="/organisers/signup"
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-ink-900)]"
                >
                  List your event
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
