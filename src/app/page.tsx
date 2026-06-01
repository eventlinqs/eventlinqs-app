import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { HeroCarousel } from '@/components/features/home/HeroCarousel'
import { HomeSchemaJsonLd } from '@/components/features/home/home-schema-jsonld'
import { CategoryChipStrip } from '@/components/features/home/category-chip-strip'
import { CulturalMomentsRail } from '@/components/features/home/cultural-moments-bento'
import { EmailSignupPanel } from '@/components/features/home/email-signup-panel'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { MELBOURNE_FALLBACK } from '@/lib/geo/detect'
import { CONTAINER } from '@/lib/ui/spacing'
import {
  EVENT_SELECT,
  toBentoEvent,
  type RawRow,
} from '@/lib/events/home-queries'
import { ThisWeekSection } from '@/components/features/home/this-week-section'
import { CulturalPicksSection } from '@/components/features/home/cultural-picks-section'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import { EventRailSection } from '@/components/features/home/event-rail-section'
import { FeaturedVenuesSection } from '@/components/features/home/featured-venues-section'
import {
  ThisWeekSkeleton,
  CulturalPicksSkeleton,
  CityRailSkeleton,
} from '@/components/features/home/section-skeletons'

/**
 * Homepage - the visceral experience layer.
 *
 * Section order (manifest A.1.1):
 *   1. SiteHeader (sticky, above fold)
 *   2. Cinematic hero (above fold) - awaited inline
 *   3. Bento grid row 1 (above fold) - awaited inline
 *   4. This Week rail (below fold) - Suspense-streamed
 *   5. Cultural Picks (below fold) - Suspense-streamed (self-fetching)
 *   6. Live Vibe marquee (below fold) - Suspense-streamed
 *   7. By City rail (below fold) - Suspense-streamed (self-fetching)
 *   8. For Organisers dark split (static, below fold)
 *   9. SiteFooter
 *
 * Streaming architecture: the shell (header + hero + bento) flushes
 * immediately. Each below-fold section is wrapped in its own <Suspense>
 * boundary, so it renders its skeleton first and streams real content
 * in parallel with the others. This mirrors the Shopify/Vercel/Linear
 * streaming-SSR pattern and cuts simulated HTML networkEndTime from
 * ~8.5s to ~2s on mobile PSI.
 */

function cheapestPriceMarker(tiers: BentoEvent['ticket_tiers']): boolean {
  if (!tiers || tiers.length === 0) return true
  return tiers.every(t => t.price === 0)
}
void cheapestPriceMarker

// ISR: re-render every 2 minutes. The homepage ships a static, anonymous
// shell - no cookies/headers in the render path - so Next.js can promote
// it to ISR. Per-user personalisation (saved-events badge, location
// picker city) is hydrated client-side from cookies post-paint.
export const revalidate = 120

// Batch 9 V2 SEO contract: title format from the brief, full Open Graph
// and Twitter Card with 1200x630 hero image, and canonical URL.
export const metadata: Metadata = {
  title: 'EventLinqs - Every community. Every event. One platform.',
  description:
    'Discover live events from communities across Australia and beyond. Afrobeats, Bollywood, Caribbean, Latin, Comedy, Pride and more. No hidden fees, verified organisers, fair refund policy.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    title: 'EventLinqs - Every community. Every event. One platform.',
    description:
      'Discover live events from communities across Australia and beyond. No hidden fees, verified organisers, fair refund policy.',
    siteName: 'EventLinqs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EventLinqs - Every community. Every event. One platform.',
    description:
      'Discover live events from communities across Australia and beyond.',
  },
}

export default async function HomePage() {
  const supabase = createPublicClient()
  const nowIso = new Date().toISOString()
  const nowMs = Date.parse(nowIso)

  const detectedLocation = MELBOURNE_FALLBACK

  // ── Above-fold data ──────────────────────────────────────────────────
  // These queries feed the hero + bento grid that render at first paint.
  // Everything else streams via Suspense boundaries below.
  //
  // Static-rendered: no city filter (geo detection is now client-side),
  // no session lookup, no per-user saved-events query. The anonymous
  // shell is identical for every visitor; the SiteHeader and the
  // saved-events button hydrate user state post-mount.
  const [
    allUpcomingResult,
    liveEventCountResult,
    cityRowsResult,
  ] = await Promise.all([
    supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(24),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso),
    supabase
      .from('events')
      .select('venue_city')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .not('venue_city', 'is', null)
      .limit(200),
  ])

  const allUpcomingRaw = allUpcomingResult.data
  const upcomingRaw = allUpcomingRaw

  const upcomingRawTyped = (upcomingRaw ?? []) as unknown as RawRow[]
  const upcoming = upcomingRawTyped.map(toBentoEvent)

  const liveEventCount = liveEventCountResult.count
  const cityRows = cityRowsResult.data
  const uniqueCitiesCount = new Set(
    (cityRows ?? []).map(r => r.venue_city?.trim().toLowerCase()).filter(Boolean),
  ).size

  void nowMs
  void liveEventCount
  void uniqueCitiesCount

  const thisWeek = upcoming
    .filter(e => new Date(e.start_date) <= new Date(nowMs + 7 * 24 * 60 * 60 * 1000))
    .slice(0, 10)

  // ── Rail slices ───────────────────────────────────────────────
  // Saturday-Sunday window for the upcoming weekend.
  const weekendStart = (() => {
    const d = new Date(nowIso)
    const day = d.getUTCDay()
    const daysToSat = (6 - day + 7) % 7
    d.setUTCDate(d.getUTCDate() + daysToSat)
    d.setUTCHours(0, 0, 0, 0)
    return d
  })()
  const weekendEnd = new Date(weekendStart)
  weekendEnd.setUTCDate(weekendEnd.getUTCDate() + 2)

  const thisWeekend = upcoming
    .filter(e => {
      const t = new Date(e.start_date).getTime()
      return t >= weekendStart.getTime() && t < weekendEnd.getTime()
    })
    .slice(0, 10)

  const freeEvents = upcoming
    .filter(e => e.is_free === true || (e.ticket_tiers ?? []).every(t => t.price === 0))
    .slice(0, 10)

  const trending = [...upcoming]
    .filter(e => (e.percent_sold ?? 0) > 0)
    .sort((a, b) => (b.percent_sold ?? 0) - (a.percent_sold ?? 0))
    .slice(0, 10)

  const justAdded = [...upcomingRawTyped]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 10)
    .map(toBentoEvent)

  const editorsPicks = (() => {
    const seen = new Set<string>()
    const picks: BentoEvent[] = []
    for (const e of upcoming) {
      const key = e.category?.slug ?? '_'
      if (seen.has(key)) continue
      seen.add(key)
      picks.push(e)
      if (picks.length >= 10) break
    }
    return picks
  })()

  const communityEvents = upcoming
    .filter(e => e.category?.slug === 'community' || e.category?.slug === 'charity')
    .slice(0, 10)

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

  return (
    <div className="min-h-screen bg-canvas">
      <HomeSchemaJsonLd baseUrl={baseUrl} />
      <SiteHeader />

      <main>
        {/* H1 - HeroCarousel (Batch 11.0): full-bleed rotating editorial
         *  hero with 5 AU friends-launch slots (Africultures, Pasifika,
         *  Diwali Mela, Lebanese Eid, Caribbean Carnival). Server
         *  component resolves photography then hands the slide manifest
         *  to a thin client controller for rotation, keyboard nav,
         *  reduced-motion handling, and ARIA announcements. */}
        <HeroCarousel />

        {/* Trust band removed Batch 11.0. The 2026 contextual-trust
         *  pattern places trust signals at the purchase-decision moment
         *  (event detail page + checkout) rather than as a sitewide
         *  band. See docs/redesign/batch-11-evidence/trust-signals-2026.md. */}

        {/* The placeholder Cultural Calendar widget and Featured Organisers
         *  row were removed to keep the homepage reading like a premium
         *  ticketing platform (real event rails, not editorial placeholders). */}

        {/* H2 Category chip strip (Batch 9.2): quick-filter chips +
         *  cultures expandable. Scroll-snap on mobile, fits viewport on
         *  desktop. Each chip fires a tagged Plausible event. */}
        <CategoryChipStrip />

        {/* Empty-state only: with zero upcoming events every rail below
         *  self-hides. The Surprise block and the Trending bento were
         *  removed in the rebuild; Trending now ships as a plain rail. */}
        {upcoming.length === 0 && (
          <section aria-label="Featured events" className="border-t border-ink-200 bg-canvas">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <div className="flex items-center justify-center rounded-2xl border border-ink-200 bg-white py-16 text-center">
                <div>
                  <p className="font-headline tracking-tight text-xl font-bold text-ink-900">
                    Events loading soon
                  </p>
                  <p className="mt-2 text-sm text-ink-400">
                    The first organisers are getting set up. Check back shortly.
                  </p>
                  <Link
                    href="/organisers/signup"
                    prefetch={false}
                    className="mt-5 inline-flex items-center rounded-lg bg-[var(--color-navy-950)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-ink-900)]"
                  >
                    List your event
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Rail 1: This Week */}
        <Suspense fallback={<ThisWeekSkeleton />}>
          <ThisWeekSection events={thisWeek} />
        </Suspense>

        {/*
         * Rail threshold rule (corrective, 23 May 2026):
         * Rails render whenever they have at least one event. The rail
         * component's own internal guard (`events.length === 0 -> return null`)
         * handles the truly-empty case. Previous iterations used `>= 3`
         * and `>= 5` thresholds which hid rails with 1-2 events; the
         * competitor research (research/competitors/REPORT.md and the
         * Humanitix / Ticketmaster / Eventbrite homepage screenshots)
         * shows no competitor does this. Rails show whatever exists.
         */}
        {/* Rail 2: This Weekend */}
        {thisWeekend.length >= 1 && (
          <EventRailSection
            eyebrow="This weekend"
            title="Free up the calendar"
            ariaLabel="Events this weekend"
            railLabel="Events this weekend"
            events={thisWeekend}
            viewAllHref="/events?preset=weekend"
          />
        )}

        {/* Rail 3: Free */}
        {freeEvents.length >= 1 && (
          <EventRailSection
            eyebrow="No ticket needed"
            title="Free events near you"
            ariaLabel="Free events"
            railLabel="Free events"
            events={freeEvents}
            viewAllHref="/events?preset=free"
          />
        )}

        {/* Rail 4: Cultures (cultural picks) */}
        <Suspense fallback={<CulturalPicksSkeleton />}>
          <CulturalPicksSection cityFilter={detectedLocation.city} nowIso={nowIso} />
        </Suspense>

        {/* Rail 5: Trending */}
        {trending.length >= 1 && (
          <EventRailSection
            eyebrow="Selling fast"
            title="Trending now"
            ariaLabel="Trending events"
            railLabel="Trending events"
            events={trending}
            viewAllHref="/events?sort=popularity"
            leadFeature
          />
        )}

        {/* Community moments - a plain separated-card rail (was a dark bento). */}
        <CulturalMomentsRail />

        {/* Rail 7: Just Added */}
        {justAdded.length >= 1 && (
          <EventRailSection
            eyebrow="Just added"
            title="Fresh on the platform"
            ariaLabel="Recently added events"
            railLabel="Recently added events"
            events={justAdded}
            viewAllHref="/events?sort=date_asc"
          />
        )}

        {/* Rail 8: Editor's Picks */}
        {editorsPicks.length >= 1 && (
          <EventRailSection
            eyebrow="Editor's picks"
            title="Hand-picked for the week"
            ariaLabel="Editor's picks"
            railLabel="Editor's picks"
            events={editorsPicks}
            viewAllHref="/events"
          />
        )}

        {/* Rail 9: Cities */}
        <Suspense fallback={<CityRailSkeleton />}>
          <CityRailSection nowIso={nowIso} />
        </Suspense>

        {/* Rail 10: Community */}
        {communityEvents.length >= 1 && (
          <EventRailSection
            eyebrow="Bring everyone"
            title="Community events"
            ariaLabel="Community events"
            railLabel="Community events"
            events={communityEvents}
            viewAllHref="/events?category=community"
          />
        )}

        {/* Rail 11: Featured Venues */}
        <FeaturedVenuesSection upcoming={upcomingRawTyped} />


        {/* 7. For Organisers - static, below fold */}
        <section aria-labelledby="organisers-heading" className="bg-[var(--color-ink-900)] py-14 sm:py-16">
          <div className={CONTAINER}>
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
              <div className="lg:max-w-lg">
                <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-400">
                  For event organisers
                </p>
                {/* For Organisers heading - retrofitted to .type-h2
                 *  per docs/M5-DESIGN-SPEC.md / Typography. Previous
                 *  inline clamp() removed (spec forbids fluid values). */}
                <h2
                  id="organisers-heading"
                  className="type-h2 mt-3 font-display text-white"
                >
                  Sell tickets.
                  <br />
                  Keep more.
                </h2>
                <p className="mt-5 text-base text-white/70">
                  Transparent fees, real-time analytics, squad booking, and a checkout your fans will actually complete. Built for organisers who take their events seriously.
                </p>

                <ul className="mt-8 space-y-3">
                  {[
                    'Open to every community and every kind of event',
                    'All-in pricing: no surprise fees at checkout',
                    'Real-time sales dashboard and scan app',
                    'Squad booking: your fans buy together',
                    'Mobile-first checkout: WhatsApp sharing built in',
                  ].map(feature => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-white/80">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold-500/20">
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
                    href="/organisers/signup"
                    className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
                  >
                    Start selling tickets
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-white/40 hover:text-white"
                  >
                    View pricing
                  </Link>
                </div>
              </div>

              <div className="group/cards grid grid-cols-2 gap-4 lg:flex-1">
                {[
                  { value: '0%',     label: 'Platform fees on free events' },
                  { value: '2-tap',  label: 'Checkout: fastest in market' },
                  { value: '5+',     label: 'Payment gateways supported' },
                  { value: '24/7',   label: 'Real-time ticket scanning' },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-200 group-hover/cards:opacity-60 hover:!opacity-100 hover:-translate-y-0.5 hover:border-gold-500/60"
                  >
                    <p className="font-display text-3xl font-extrabold text-gold-400">{stat.value}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* H13 - Email signup panel (Batch 9.2): editorial brand-voice
         *  copy + inline form + dual-path organiser link. */}
        <EmailSignupPanel />
      </main>

      <SiteFooter />
    </div>
  )
}
