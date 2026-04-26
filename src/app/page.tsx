import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { FeaturedEventHero } from '@/components/features/events/featured-event-hero'
import type {
  FeaturedHeroEventSlide,
} from '@/components/features/events/featured-event-hero'
import { CATEGORY_HIGHLIGHT_SLIDES } from '@/lib/content/category-highlight-slides'
import { BentoGrid, BentoTile, BentoSupportingColumn } from '@/components/features/events/bento-grid'
import { EventBentoTile } from '@/components/features/events/event-bento-tile'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { detectLocation } from '@/lib/geo/detect'
import { LocationFilterBanner } from '@/components/features/events/location-filter-banner'
import {
  SECTION_DEFAULT,
  CONTAINER,
  HEADER_TO_CONTENT,
} from '@/lib/ui/spacing'
import {
  EVENT_SELECT,
  toBentoEvent,
  toFeaturedHeroEvent,
  type RawRow,
} from '@/lib/events/home-queries'
import { ThisWeekSection } from '@/components/features/home/this-week-section'
import { CulturalPicksSection } from '@/components/features/home/cultural-picks-section'
import { LiveVibeSection } from '@/components/features/home/live-vibe-section'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import {
  ThisWeekSkeleton,
  CulturalPicksSkeleton,
  LiveVibeSkeleton,
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

export default async function HomePage() {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  const nowMs = Date.parse(nowIso)

  const detectedLocation = await detectLocation()
  const cityFilter = detectedLocation.city

  // ── Above-fold data ──────────────────────────────────────────────────
  // These queries feed the hero + bento grid that render at first paint.
  // Everything else streams via Suspense boundaries below.
  const [
    cityUpcomingResult,
    allUpcomingResult,
    sessionResult,
    liveEventCountResult,
    cityRowsResult,
  ] = await Promise.all([
    supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .ilike('venue_city', `%${cityFilter}%`)
      .order('start_date', { ascending: true })
      .limit(24),
    supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(24),
    supabase.auth.getSession(),
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

  const cityUpcomingRaw = cityUpcomingResult.data
  const allUpcomingRaw = allUpcomingResult.data
  const locationFilterActive = (cityUpcomingRaw ?? []).length >= 2
  const upcomingRaw = locationFilterActive ? cityUpcomingRaw : allUpcomingRaw

  const upcomingRawTyped = (upcomingRaw ?? []) as unknown as RawRow[]
  const upcoming = upcomingRawTyped.map(toBentoEvent)

  const session = sessionResult.data.session
  const liveEventCount = liveEventCountResult.count
  const cityRows = cityRowsResult.data
  const uniqueCitiesCount = new Set(
    (cityRows ?? []).map(r => r.venue_city?.trim().toLowerCase()).filter(Boolean),
  ).size

  const featuredRaw = upcomingRawTyped[0] ?? null
  const featuredHero = featuredRaw ? toFeaturedHeroEvent(featuredRaw) : null

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Hero carousel scoring - top 5 soonest events, rank by recency + heat.
  const heroCandidateRaws = upcomingRawTyped.slice(0, 5)
  const scoredCandidates = heroCandidateRaws.map(r => {
    const tiers = r.ticket_tiers ?? []
    const sold = tiers.reduce((s, t) => s + t.sold_count, 0)
    const cap = tiers.reduce((s, t) => s + t.total_capacity, 0)
    const pct = cap > 0 ? (sold / cap) * 100 : 0
    const createdMs = Date.parse(r.created_at)
    const startMs = Date.parse(r.start_date)
    let score = 0
    if (pct > 70) score += 50
    if (nowMs - createdMs < 48 * 60 * 60 * 1000) score += 25
    if (startMs - nowMs < 7 * 24 * 60 * 60 * 1000) score += 20
    return { raw: r, score }
  })
  scoredCandidates.sort((a, b) => b.score - a.score)

  const topCandidates = scoredCandidates.slice(0, 3)
  const heroEventIds = topCandidates.map(c => c.raw.id)
  const userIdForSaved = session?.user?.id ?? null

  // Phase 2 (parallel) - two independent queries run together instead of
  // stacked awaits. Aggregated orders query replaces 3 per-event count
  // queries for the hero carousel.
  const [soldTodayResult, savedRowsResult] = await Promise.all([
    heroEventIds.length > 0
      ? supabase
          .from('orders')
          .select('event_id')
          .in('event_id', heroEventIds)
          .eq('status', 'confirmed')
          .gte('created_at', todayStart.toISOString())
      : Promise.resolve({ data: [] as { event_id: string }[] }),
    userIdForSaved
      ? supabase
          .from('saved_events')
          .select('event_id')
          .eq('user_id', userIdForSaved)
      : Promise.resolve({ data: [] as { event_id: string }[] }),
  ])

  const soldTodayByEvent = new Map<string, number>()
  for (const row of soldTodayResult.data ?? []) {
    soldTodayByEvent.set(row.event_id, (soldTodayByEvent.get(row.event_id) ?? 0) + 1)
  }

  const savedEventIds = new Set(
    (savedRowsResult.data ?? []).map(r => r.event_id as string),
  )

  const heroEventSlides = topCandidates.map(({ raw }) => ({
    event: toFeaturedHeroEvent(raw),
    ticketsSoldToday: soldTodayByEvent.get(raw.id) ?? 0,
  })) as FeaturedHeroEventSlide[]

  const highlightSlidesNeeded = Math.max(0, 3 - heroEventSlides.length)
  const heroHighlightSlides = CATEGORY_HIGHLIGHT_SLIDES.slice(0, highlightSlidesNeeded)

  const supportingEvents = upcoming.slice(1, 4)
  const thisWeek = upcoming
    .filter(e => new Date(e.start_date) <= new Date(nowMs + 7 * 24 * 60 * 60 * 1000))
    .slice(0, 10)

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        {/* 1. Cinematic hero - above fold, rendered inline */}
        <FeaturedEventHero
          eventSlides={heroEventSlides}
          highlightSlides={heroHighlightSlides}
          liveEventCount={liveEventCount ?? 0}
          uniqueCitiesCount={uniqueCitiesCount}
        />

        {/* 2. Bento grid row 1 - above fold, rendered inline */}
        <section aria-label="Featured events" className={`bg-canvas ${SECTION_DEFAULT}`}>
          <div className={CONTAINER}>
            <div className="mb-4">
              <LocationFilterBanner
                location={detectedLocation}
                filteredActive={locationFilterActive}
              />
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
                    The lineup
                  </p>
                  <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                    What everyone is buying into
                  </h2>
                </div>
              </div>
              <Link
                href="/events"
                className="shrink-0 text-sm font-medium text-gold-700 whitespace-nowrap transition-colors hover:text-gold-600"
              >
                View all events &rsaquo;
              </Link>
            </div>

            <div className={HEADER_TO_CONTENT}>
              {featuredHero ? (
                <BentoGrid>
                  <BentoTile size="hero">
                    <EventBentoTile
                      event={featuredHero as BentoEvent}
                      size="hero"
                      useVideoFallback
                      featured
                      initiallySaved={savedEventIds.has(featuredHero.id)}
                    />
                  </BentoTile>

                  <BentoSupportingColumn>
                    {supportingEvents.map(event => (
                      <BentoTile key={event.id} size="supporting">
                        <EventBentoTile
                          event={event}
                          size="supporting"
                          initiallySaved={savedEventIds.has(event.id)}
                        />
                      </BentoTile>
                    ))}
                  </BentoSupportingColumn>
                </BentoGrid>
              ) : (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white py-20 text-center">
                  <div>
                    <p className="font-display text-xl font-bold text-ink-900">
                      Events loading soon
                    </p>
                    <p className="mt-2 text-sm text-ink-400">
                      The first organisers are getting set up. Check back shortly.
                    </p>
                    <Link
                      href="/organisers/signup"
                      className="mt-5 inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
                    >
                      List your event
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. This Week rail - below fold, Suspense-streamed */}
        <Suspense fallback={<ThisWeekSkeleton />}>
          <ThisWeekSection events={thisWeek} />
        </Suspense>

        {/* 4. Cultural Picks - below fold, Suspense-streamed (self-fetching) */}
        <Suspense fallback={<CulturalPicksSkeleton />}>
          <CulturalPicksSection cityFilter={cityFilter} nowIso={nowIso} />
        </Suspense>

        {/* 5. Live Vibe marquee - below fold, Suspense-streamed */}
        <Suspense fallback={<LiveVibeSkeleton />}>
          <LiveVibeSection upcomingRaw={upcomingRawTyped} />
        </Suspense>

        {/* 6. By City rail - below fold, Suspense-streamed (self-fetching) */}
        <Suspense fallback={<CityRailSkeleton />}>
          <CityRailSection nowIso={nowIso} />
        </Suspense>

        {/* 7. For Organisers - static, below fold */}
        <section aria-labelledby="organisers-heading" className={`bg-ink-950 ${SECTION_DEFAULT}`}>
          <div className={CONTAINER}>
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
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
                  Transparent fees, real-time analytics, squad booking, and a checkout your fans will actually complete. Built for organisers who take their events seriously.
                </p>

                <ul className="mt-8 space-y-3">
                  {[
                    'Open to every community and every kind of event',
                    'All-in pricing: no surprise fees at checkout',
                    'Real-time sales dashboard and scan app',
                    'Squad booking: your fans buy together',
                    'Africa-ready: mobile money, WhatsApp sharing',
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
      </main>

      <SiteFooter />
    </div>
  )
}
