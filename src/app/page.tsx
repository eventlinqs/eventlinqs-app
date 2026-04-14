import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventCard } from '@/components/features/events/event-card'
import type { EventCardData } from '@/components/features/events/event-card'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'

/**
 * Homepage — Pattern A cinematic hero + content sections.
 *
 * Spec §7.1 section order:
 *   1. SiteHeader (sticky)
 *   2. Hero — full-bleed photo, left-aligned display text, gold CTA (Pattern A)
 *   3. TRENDING NOW — horizontal card carousel stub (data wired Session 3)
 *   4. CULTURE PICKS — tabbed section stub (data wired Session 3)
 *   5. FOR ORGANISERS — dark split section
 *   6. SiteFooter
 *
 * Hero image: picsum.photos seed — replaced by Unsplash API in Session 3.
 */

// Section header component used across sections
function SectionHeader({
  eyebrow,
  title,
  href,
  linkLabel = 'View all',
}: {
  eyebrow: string
  title: string
  href: string
  linkLabel?: string
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-start gap-3">
        {/* Gold bar accent */}
        <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden="true" />
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
            {eyebrow}
          </p>
          <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
            {title}
          </h2>
        </div>
      </div>
      <Link
        href={href}
        className="shrink-0 text-sm font-medium text-gold-500 hover:text-gold-600 transition-colors whitespace-nowrap"
      >
        {linkLabel} &rsaquo;
      </Link>
    </div>
  )
}

export default async function HomePage() {
  const supabase = await createClient()

  // Fetch 6 upcoming published events for TRENDING NOW preview
  const { data: trendingRaw } = await supabase
    .from('events')
    .select('id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(6)

  const trending = (trendingRaw ?? []) as unknown as EventCardData[]

  // Fetch 6 events tagged with culture-relevant tags for CULTURE PICKS
  const { data: cultureRaw } = await supabase
    .from('events')
    .select('id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .contains('tags', ['african'])
    .order('start_date', { ascending: true })
    .limit(6)

  const culturePicks = (cultureRaw ?? []) as unknown as EventCardData[]

  // Build dynamic price maps
  function cheapestTierIds(events: EventCardData[]) {
    return events
      .map(e => {
        const tiers = e.ticket_tiers
        if (!tiers || tiers.length === 0) return null
        return tiers.reduce((min, t) => t.price < min.price ? t : min, tiers[0]).id
      })
      .filter((id): id is string => id !== null)
  }

  // Fetch soonest upcoming event for hero featured card
  const { data: featuredRaw } = await supabase
    .from('events')
    .select('id, slug, title, start_date, venue_name, venue_city, ticket_tiers(id, price, currency), organisation:organisations(name)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(1)

  type FeaturedEvent = {
    id: string
    slug: string
    title: string
    start_date: string
    venue_name: string | null
    venue_city: string | null
    ticket_tiers: { id: string; price: number; currency: string }[]
    organisation: { name: string } | null
  }

  const featuredEvent = (featuredRaw?.[0] ?? null) as FeaturedEvent | null

  const [trendingPrices, culturePrices] = await Promise.all([
    getDynamicPriceMap(cheapestTierIds(trending)),
    getDynamicPriceMap(cheapestTierIds(culturePicks)),
  ])

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        {/* ── 1. HERO — cinematic video backdrop ───────────────── */}
        <section
          aria-label="Hero"
          className="relative flex min-h-[75vh] items-end overflow-hidden bg-navy-950 md:min-h-[85vh]"
        >
          {/* Fallback radial gradient — visible when video fails to load */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(212,160,23,0.05) 0%, transparent 60%)',
            }}
            aria-hidden="true"
          />

          {/* Video backdrop — autoplay, muted, loop, no controls */}
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden="true"
          >
            <source src="/hero/hero-crowd.mp4" type="video/mp4" />
          </video>

          {/* Dark overlay — top-to-bottom navy fade for text legibility */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, rgba(10,14,26,0.60) 0%, rgba(10,14,26,0.70) 50%, rgba(10,14,26,1) 100%)',
            }}
            aria-hidden="true"
          />

          {/* Hero content — left copy + right featured event */}
          <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8 lg:pb-20">
            <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">

              {/* Left — H1, subhead, CTAs */}
              <div className="max-w-2xl">
                {/* Eyebrow pill */}
                <span className="inline-flex items-center rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gold-400">
                  Made for the diaspora
                </span>

                {/* Display heading */}
                <h1
                  className="mt-4 font-display font-extrabold leading-none tracking-tight text-white"
                  style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)' }}
                >
                  Where the{' '}
                  <span className="text-gold-400">culture</span>
                  {' '}gathers.
                </h1>

                <p className="mt-5 max-w-lg text-base text-white/75 sm:text-lg">
                  Tickets for events that move you. Afrobeats, Gospel, Amapiano,
                  Owambe, Comedy — no hidden fees, ever.
                </p>

                {/* CTAs */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/events"
                    className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-gold-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
                  >
                    Browse Events
                  </Link>
                  <Link
                    href="/organiser"
                    className="inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
                  >
                    Create an Event
                  </Link>
                </div>
              </div>

              {/* Right — Featured event card (null-safe — renders nothing if no upcoming event) */}
              {featuredEvent && (() => {
                const cheapestTier = featuredEvent.ticket_tiers.length > 0
                  ? featuredEvent.ticket_tiers.reduce((min, t) => t.price < min.price ? t : min, featuredEvent.ticket_tiers[0])
                  : null
                const priceDisplay = cheapestTier
                  ? cheapestTier.price === 0
                    ? 'Free'
                    : `From ${cheapestTier.currency ?? 'AUD'} $${(cheapestTier.price / 100).toFixed(0)}`
                  : null
                const eventDate = new Intl.DateTimeFormat('en-AU', {
                  month: 'short', day: 'numeric', year: 'numeric',
                }).format(new Date(featuredEvent.start_date))
                const venue = [featuredEvent.venue_name, featuredEvent.venue_city]
                  .filter(Boolean).join(', ')

                return (
                  <div className="shrink-0 lg:w-80 xl:w-96">
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gold-400">
                        Happening soon
                      </p>
                      <h2
                        className="mt-2 font-display font-bold leading-tight text-white"
                        style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}
                      >
                        {featuredEvent.title}
                      </h2>
                      <div className="mt-3 space-y-1 text-sm text-white/70">
                        <p>{eventDate}</p>
                        {venue && <p>{venue}</p>}
                        {featuredEvent.organisation?.name && (
                          <p>by {featuredEvent.organisation.name}</p>
                        )}
                        {priceDisplay && (
                          <p className="font-semibold text-gold-400">{priceDisplay}</p>
                        )}
                      </div>
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-white/50">
                        <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden="true" />
                        247 people viewing
                      </p>
                      <Link
                        href={`/events/${featuredEvent.slug}`}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-gold-500/60 bg-gold-500/15 px-4 py-2.5 text-sm font-semibold text-gold-400 transition-colors hover:bg-gold-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                      >
                        View event &rarr;
                      </Link>
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>
        </section>

        {/* ── 2. TRENDING NOW ──────────────────────────────────────── */}
        <section aria-labelledby="trending-heading" className="bg-canvas py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Hot right now"
              title="Trending Now"
              href="/events"
              linkLabel="See all events"
            />

            {trending.length > 0 ? (
              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {trending.map(event => (
                  <EventCard key={event.id} event={event} dynamicPrices={trendingPrices} />
                ))}
              </div>
            ) : (
              <div className="mt-8 flex items-center justify-center rounded-xl border border-dashed border-ink-200 py-16">
                <p className="text-sm text-ink-400">Events loading soon — check back shortly.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── 3. CULTURE PICKS ─────────────────────────────────────── */}
        <section aria-labelledby="culture-heading" className="bg-ink-100 py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Made for the diaspora"
              title="Culture Picks"
              href="/events"
              linkLabel="Explore culture"
            />

            {/* Sub-tab strip — layout only, data wired Session 3 */}
            <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {['All', 'Afrobeats', 'Amapiano', 'Gospel', 'Comedy', 'Owambe', 'Business'].map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    i === 0
                      ? 'bg-gold-500 text-white'
                      : 'bg-white text-ink-600 hover:bg-gold-100 hover:text-gold-600 border border-ink-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {culturePicks.length > 0 ? (
              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {culturePicks.map(event => (
                  <EventCard key={event.id} event={event} dynamicPrices={culturePrices} />
                ))}
              </div>
            ) : (
              /* Fallback: show trending if no culture-tagged events yet */
              trending.length > 0 ? (
                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {trending.slice(0, 3).map(event => (
                    <EventCard key={event.id} event={event} dynamicPrices={trendingPrices} />
                  ))}
                </div>
              ) : (
                <div className="mt-8 flex items-center justify-center rounded-xl border border-dashed border-ink-200 py-16 bg-white">
                  <p className="text-sm text-ink-400">Cultural events loading soon.</p>
                </div>
              )
            )}
          </div>
        </section>

        {/* ── 4. FOR ORGANISERS — dark split section ────────────────── */}
        <section aria-labelledby="organisers-heading" className="bg-ink-900 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">

              {/* Text side */}
              <div className="lg:max-w-lg">
                <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-400">
                  For event organisers
                </p>
                <h2
                  id="organisers-heading"
                  className="mt-3 font-display font-bold leading-tight text-white"
                  style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' }}
                >
                  Sell tickets.
                  <br />
                  Keep more.
                </h2>
                <p className="mt-5 text-base text-white/70">
                  Transparent fees, real-time analytics, squad booking, and a checkout
                  your fans will actually complete. Built for organisers who take their
                  events seriously.
                </p>

                {/* Feature bullets */}
                <ul className="mt-8 space-y-3">
                  {[
                    'All-in pricing — no surprise fees at checkout',
                    'Real-time sales dashboard and scan app',
                    'Squad booking — your fans buy together',
                    'Africa-ready: mobile money, WhatsApp sharing',
                  ].map(feature => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-white/80">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-gold-500/20 flex items-center justify-center">
                        <svg className="h-2.5 w-2.5 text-gold-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-10 flex flex-wrap gap-3">
                  <Link
                    href="/organiser"
                    className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-white hover:bg-gold-600 transition-colors"
                  >
                    Start selling tickets
                  </Link>
                  <Link
                    href="/organiser/pricing"
                    className="inline-flex items-center rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 hover:border-white/40 hover:text-white transition-colors"
                  >
                    View pricing
                  </Link>
                </div>
              </div>

              {/* Stats side */}
              <div className="grid grid-cols-2 gap-4 lg:flex-1">
                {[
                  { value: '0%',     label: 'Platform fees on free events' },
                  { value: '2-tap',  label: 'Checkout — fastest in market' },
                  { value: '5+',     label: 'Payment gateways supported' },
                  { value: '24/7',   label: 'Real-time ticket scanning' },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/10 bg-white/5 p-5"
                  >
                    <p className="font-display text-3xl font-extrabold text-gold-400">{stat.value}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{stat.label}</p>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
