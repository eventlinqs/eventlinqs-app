import Link from 'next/link'
import { SmartMedia } from '@/components/ui/smart-media'
import { GlassCard } from '@/components/ui/glass-card'
import { getFeaturedEventMedia, type EventMediaInput } from '@/lib/images/event-media'

/**
 * FeaturedEventHero — full-viewport cinematic hero for the homepage.
 *
 * Background: SmartMedia (video preferred, then carousel, then Ken Burns).
 * Foreground (left): eyebrow, display headline, subcopy, CTAs.
 * Foreground (right, md+): floating glassmorphism event info card.
 *
 * Always renders — even if no featured event exists, falls back to
 * Pexels category video + generic copy. This is the stage the product lives on.
 */

export interface FeaturedHeroEvent extends EventMediaInput {
  id: string
  slug: string
  start_date: string
  venue_name?: string | null
  venue_city?: string | null
  organisation?: { name?: string | null } | null
  ticket_tiers?: { price: number; currency: string }[] | null
  summary?: string | null
  sold_today?: number | null
}

interface Props {
  event: FeaturedHeroEvent | null
  liveEventCount?: number
  uniqueCitiesCount?: number
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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

export async function FeaturedEventHero({ event, liveEventCount = 0, uniqueCitiesCount = 0 }: Props) {
  const input: EventMediaInput = event ?? {
    title: 'Where the culture gathers',
    category: { slug: 'festival', name: 'Festival' },
  }
  const media = await getFeaturedEventMedia(input)

  const city = event?.venue_city ?? 'a city near you'
  const eyebrow = event
    ? `Featured · ${formatLongDate(event.start_date)} · ${city}`
    : 'Featured · Every weekend · Globally'

  const headline = event?.title ?? 'Where the culture gathers.'
  const subcopy = event?.summary
    ? event.summary
    : 'Afrobeats, Amapiano, Comedy, Gospel, Owambe and the culture that makes every weekend matter. Tickets with no hidden fees, ever.'

  const price = event ? formatFromPrice(event.ticket_tiers ?? null) : null
  const primaryHref = event ? `/events/${event.slug}` : '/events'
  const primaryLabel = event ? 'Get tickets' : 'Browse events'

  return (
    <section
      aria-label="Featured event"
      className="relative flex min-h-[70vh] items-end overflow-hidden bg-navy-950 md:min-h-[90vh]"
    >
      <div className="absolute inset-0">
        <SmartMedia media={media} autoplay priority />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.45) 0%, rgba(10,22,40,0.75) 65%, rgba(10,14,26,1) 100%)',
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 10% 40%, rgba(10,22,40,0.1) 0%, rgba(10,22,40,0.7) 70%)',
          }}
          aria-hidden
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl animate-fade-rise">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-400">
              {eyebrow}
            </p>
            <h1
              className="mt-4 font-display font-extrabold leading-[0.95] tracking-tight text-white"
              style={{ fontSize: 'clamp(2.75rem, 7vw, 6rem)' }}
            >
              {headline}
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/80 sm:text-lg">{subcopy}</p>

            {liveEventCount >= 10 && (
              <div className="mt-4 inline-flex items-center gap-2.5 text-[13px] text-white/75 font-medium">
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

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-gold-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-gold-600 hover:shadow-gold-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                {primaryLabel}
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center rounded-lg border border-white/25 bg-white/5 px-6 py-3 text-base font-semibold text-white backdrop-blur-md transition-colors duration-200 hover:border-white/50 hover:bg-white/10"
              >
                Browse all events
              </Link>
            </div>
          </div>

          {event && (
            <GlassCard
              variant="dark"
              as="aside"
              className="hidden w-full max-w-sm shrink-0 animate-fade-rise rounded-2xl p-5 lg:block"
            >
              <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gold-400">
                Happening soon
              </p>
              <h2 className="mt-2 font-display text-xl font-bold leading-tight text-white line-clamp-2">
                {event.title}
              </h2>
              <div className="mt-3 space-y-1 text-sm text-white/75">
                <p>{formatLongDate(event.start_date)}</p>
                {event.venue_name && (
                  <p className="line-clamp-1">
                    {event.venue_name}
                    {event.venue_city ? ` · ${event.venue_city}` : ''}
                  </p>
                )}
                {event.organisation?.name && (
                  <p className="text-white/55">by {event.organisation.name}</p>
                )}
                {price && <p className="font-semibold text-gold-300">{price}</p>}
              </div>
              {event.sold_today && event.sold_today > 0 ? (
                <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-white/85">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-500 opacity-80" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-coral-500" />
                  </span>
                  {event.sold_today} tickets sold today
                </p>
              ) : null}
              <Link
                href={`/events/${event.slug}`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-gold-400/60 bg-gold-500/15 px-4 py-2.5 text-sm font-semibold text-gold-300 transition-colors duration-200 hover:bg-gold-500/25"
              >
                View event <span aria-hidden className="ml-1.5">&rarr;</span>
              </Link>
            </GlassCard>
          )}
        </div>
      </div>
    </section>
  )
}
