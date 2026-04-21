import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { FeaturedEventHero } from '@/components/features/events/featured-event-hero'
import type {
  FeaturedHeroEvent,
  FeaturedHeroEventSlide,
} from '@/components/features/events/featured-event-hero'
import { CATEGORY_HIGHLIGHT_SLIDES } from '@/lib/content/category-highlight-slides'
import { BentoGrid, BentoTile, BentoSupportingColumn } from '@/components/features/events/bento-grid'
import { EventBentoTile } from '@/components/features/events/event-bento-tile'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { LiveVibeMarquee, type VibeImage } from '@/components/features/events/live-vibe-marquee'
import { CityRailTile } from '@/components/features/events/city-rail-tile'
import { SnapRail } from '@/components/ui/snap-rail'
import { CulturalPicksRail } from '@/components/features/events/cultural-picks-rail'
import { getCityPhoto } from '@/lib/images/city-photo'
import { detectLocation } from '@/lib/geo/detect'
import { LocationFilterBanner } from '@/components/features/events/location-filter-banner'
import {
  SECTION_DEFAULT,
  SECTION_TIGHT,
  CONTAINER,
  HEADER_TO_CONTENT,
} from '@/lib/ui/spacing'

/**
 * Homepage — the visceral experience layer.
 *
 * Section order (manifest A.1.1):
 *   1. SiteHeader (sticky)
 *   2. Cinematic hero (FeaturedEventHero)
 *   3. Bento grid row 1 (featured + supporting tiles)
 *   4. This Week horizontal strip
 *   5. Cultural Picks with bento sub-grid per tab
 *   6. By City bento
 *   7. Live Vibe marquee
 *   8. For Organisers dark split
 *   9. SiteFooter
 */

const EVENT_SELECT =
  'id, slug, title, summary, cover_image_url, thumbnail_url, gallery_urls, start_date, venue_name, venue_city, venue_state, venue_country, is_free, created_at, category:event_categories(name, slug), organisation:organisations(name), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

type RawRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  start_date: string
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  is_free: boolean | null
  created_at: string
  category: { name: string; slug: string } | null
  organisation: { name: string } | null
  ticket_tiers: { id: string; price: number; currency: string; sold_count: number; reserved_count: number; total_capacity: number }[] | null
}

function toBentoEvent(r: RawRow): BentoEvent {
  const tiers = r.ticket_tiers ?? []
  const sold = tiers.reduce((s, t) => s + t.sold_count, 0)
  const cap = tiers.reduce((s, t) => s + t.total_capacity, 0)
  const percent_sold = cap > 0 ? Math.round((sold / cap) * 100) : null
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    cover_image_url: r.cover_image_url,
    thumbnail_url: r.thumbnail_url,
    gallery_urls: r.gallery_urls,
    start_date: r.start_date,
    venue_name: r.venue_name,
    venue_city: r.venue_city,
    is_free: r.is_free,
    category: r.category,
    ticket_tiers: tiers.map(t => ({ price: t.price, currency: t.currency })),
    percent_sold,
  }
}

function toFeaturedHeroEvent(r: RawRow): FeaturedHeroEvent {
  return {
    ...toBentoEvent(r),
    organisation: r.organisation,
  }
}

// ── Cultural Picks tabs ──────────────────────────────────────────────
// Gospel dropped from homepage tab strip (still filterable, still has landing page).
const CULTURE_TABS: { slug: string; label: string; tag: string; href: string }[] = [
  { slug: 'afrobeats',   label: 'Afrobeats',  tag: 'afrobeats',   href: '/categories/afrobeats' },
  { slug: 'amapiano',    label: 'Amapiano',   tag: 'amapiano',    href: '/categories/amapiano' },
  { slug: 'owambe',      label: 'Owambe',     tag: 'owambe',      href: '/categories/owambe' },
  { slug: 'caribbean',   label: 'Caribbean',  tag: 'caribbean',   href: '/categories/caribbean' },
  { slug: 'heritage',    label: 'Heritage',   tag: 'heritage',    href: '/categories/heritage-and-independence' },
  { slug: 'networking',  label: 'Business',   tag: 'business',    href: '/categories/networking' },
]

const CITY_TILES = [
  // Primary — Australian communities shown first for the M4.5 launch.
  { city: 'Melbourne',    slug: 'melbourne' },
  { city: 'Sydney',       slug: 'sydney' },
  { city: 'Brisbane',     slug: 'brisbane' },
  { city: 'Perth',        slug: 'perth' },
  { city: 'Adelaide',     slug: 'adelaide' },
  { city: 'Gold Coast',   slug: 'gold-coast' },
  { city: 'Geelong',      slug: 'geelong' },
  { city: 'Hobart',       slug: 'hobart' },
  { city: 'Canberra',     slug: 'canberra' },
  { city: 'Darwin',       slug: 'darwin' },
  { city: 'Newcastle',    slug: 'newcastle' },
  { city: 'Wollongong',   slug: 'wollongong' },
  // Secondary — international diaspora cities still reachable.
  { city: 'Auckland',     slug: 'auckland' },
  { city: 'London',       slug: 'london' },
  { city: 'Manchester',   slug: 'manchester' },
  { city: 'Dublin',       slug: 'dublin' },
  { city: 'Toronto',      slug: 'toronto' },
  { city: 'New York',     slug: 'new-york' },
  { city: 'Houston',      slug: 'houston' },
  { city: 'Lagos',        slug: 'lagos' },
  { city: 'Accra',        slug: 'accra' },
]

export default async function HomePage() {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  const nowMs = Date.parse(nowIso)

  const weekEndIso = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Resolve the visitor's city (cookie → Vercel headers → Melbourne fallback)
  // so every feed on this page can prefer local events when there are some.
  const detectedLocation = await detectLocation()
  const cityFilter = detectedLocation.city

  // Upcoming public events — pull 24 to fuel hero + bento + cultural tabs + This Week.
  // Try the city-filtered query first; if it returns fewer than 2 rows, fall back
  // to the unfiltered feed so sparse cities don't leave the homepage empty.
  const { data: cityUpcomingRaw } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .ilike('venue_city', `%${cityFilter}%`)
    .order('start_date', { ascending: true })
    .limit(24)

  let upcomingRaw = cityUpcomingRaw
  const locationFilterActive = (cityUpcomingRaw ?? []).length >= 2
  if (!locationFilterActive) {
    const { data: allUpcomingRaw } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(24)
    upcomingRaw = allUpcomingRaw
  }

  const upcoming = ((upcomingRaw ?? []) as unknown as RawRow[]).map(toBentoEvent)
  const upcomingRawTyped = (upcomingRaw ?? []) as unknown as RawRow[]

  // Saved events for the current session (empty set if not signed in)
  const { data: { session } } = await supabase.auth.getSession()
  let savedEventIds = new Set<string>()
  if (session?.user?.id) {
    const { data: savedRows } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', session.user.id)
    savedEventIds = new Set((savedRows ?? []).map(r => r.event_id as string))
  }

  // Live platform counts — fuels hero live strip
  const { count: liveEventCount } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)

  const { data: cityRows } = await supabase
    .from('events')
    .select('venue_city')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .not('venue_city', 'is', null)

  const uniqueCitiesCount = new Set(
    (cityRows ?? []).map(r => r.venue_city?.trim().toLowerCase()).filter(Boolean)
  ).size

  // Featured event (soonest upcoming) for cinematic hero + hero bento tile
  const featuredRaw = upcomingRawTyped[0] ?? null
  const featuredHero: FeaturedHeroEvent | null = featuredRaw ? toFeaturedHeroEvent(featuredRaw) : null

  // Tickets sold today — fuels live signal on hero ribbon card
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  async function getTicketsSoldToday(eventId: string): Promise<number> {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .gte('created_at', todayStart.toISOString())
    return count ?? 0
  }

  // ── Hero carousel candidates ─────────────────────────────────────────
  // Score the top 5 soonest events; pick highest-scoring for rotation.
  // Signals: percent_sold > 70 (+50), created within 48h (+25), start within 7d (+20).
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

  const heroEventSlides: FeaturedHeroEventSlide[] = await Promise.all(
    scoredCandidates.slice(0, 3).map(async ({ raw }) => ({
      event: toFeaturedHeroEvent(raw),
      ticketsSoldToday: await getTicketsSoldToday(raw.id),
    })),
  )

  // Pad with category highlight slides if we have fewer than 3 real events.
  const highlightSlidesNeeded = Math.max(0, 3 - heroEventSlides.length)
  const heroHighlightSlides = CATEGORY_HIGHLIGHT_SLIDES.slice(0, highlightSlidesNeeded)

  // Bento row: featured hero + 3 equal-weight supporting events
  const supportingEvents = upcoming.slice(1, 4)

  // This Week — events within next 7 days, pre-rendered as rail cards
  const thisWeek = upcoming.filter(e => new Date(e.start_date) <= new Date(weekEndIso)).slice(0, 10)
  const thisWeekCards = await Promise.all(
    thisWeek.map(async e => <ThisWeekCard key={e.id} event={e} />),
  )

  // Cultural picks per tab — try city-filtered first, fall back to all events
  // for that tag when the local feed is sparse (<2 rows).
  const culturalQueries = await Promise.all(
    CULTURE_TABS.map(async tab => {
      let { data } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', nowIso)
        .contains('tags', [tab.tag])
        .ilike('venue_city', `%${cityFilter}%`)
        .order('start_date', { ascending: true })
        .limit(8)
      if ((data ?? []).length < 2) {
        const result = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('status', 'published')
          .eq('visibility', 'public')
          .gte('start_date', nowIso)
          .contains('tags', [tab.tag])
          .order('start_date', { ascending: true })
          .limit(8)
        data = result.data
      }
      const events = ((data ?? []) as unknown as RawRow[]).map(toBentoEvent)
      const cards = await Promise.all(events.map(async e => <ThisWeekCard key={e.id} event={e} />))
      return { tab, events, cards }
    }),
  )

  const culturalPicksTabs = culturalQueries
    .filter(q => q.events.length > 0)
    .map(q => ({
      slug: q.tab.slug,
      label: q.tab.label,
      href: q.tab.href,
      cards: <>{q.cards}</>,
    }))

  // City counts + real Pexels photography, fetched in parallel per city
  const cityCounts = await Promise.all(
    CITY_TILES.map(async t => {
      const [countResult, photo] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true })
          .eq('status', 'published').eq('visibility', 'public')
          .gte('start_date', nowIso).ilike('venue_city', `%${t.slug}%`),
        getCityPhoto(t.slug),
      ])
      return {
        ...t,
        count: countResult.count ?? 0,
        imageSrc: photo ?? `/cities/${t.slug}.svg`,
      }
    }),
  )

  // Live Vibe — community event cards scrolling across the cream band.
  // Real events first; if fewer than 6, pad with branded placeholder tiles
  // carrying a community label. No Pexels here — tile context.
  const realVibeImages: VibeImage[] = upcomingRawTyped.slice(0, 20).map(raw => {
    const picsum = /^https:\/\/picsum\.photos\//i
    const pickReal = (u: string | null): string | null =>
      u && !picsum.test(u) ? u : null
    const src = pickReal(raw.cover_image_url) ?? pickReal(raw.thumbnail_url) ?? null
    const community = [raw.venue_city, raw.venue_state, raw.venue_country]
      .filter(Boolean)
      .slice(0, 2)
      .join(', ')
    return {
      id: raw.id,
      src,
      href: `/events/${raw.slug}`,
      title: raw.title,
      community: community || 'Live on EventLinqs',
      placeholderCategory: raw.category?.name ?? raw.category?.slug ?? null,
    }
  })

  const fallbackCommunityTiles: VibeImage[] = [
    { id: 'f1', src: null, href: '/events?city=melbourne', title: 'Afrobeats scene in Melbourne',  community: 'Melbourne, VIC',       placeholderCategory: 'Afrobeats' },
    { id: 'f2', src: null, href: '/events?city=sydney',    title: 'Community events in Sydney',    community: 'Sydney, NSW',          placeholderCategory: 'Community' },
    { id: 'f3', src: null, href: '/events?city=brisbane',  title: 'Gospel nights Brisbane',        community: 'Brisbane, QLD',        placeholderCategory: 'Gospel' },
    { id: 'f4', src: null, href: '/events?city=geelong',   title: 'Geelong community scene',       community: 'Geelong, VIC',         placeholderCategory: 'Community' },
    { id: 'f5', src: null, href: '/events?city=perth',     title: 'Diaspora events Perth',         community: 'Perth, WA',            placeholderCategory: 'Heritage' },
    { id: 'f6', src: null, href: '/events',                title: 'Regional Australia events',     community: 'Across Australia',     placeholderCategory: 'Festival' },
  ]

  let vibeImages: VibeImage[] = realVibeImages
  if (vibeImages.length < 6) {
    vibeImages = [...vibeImages, ...fallbackCommunityTiles].slice(0, 12)
  }

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        {/* 1. Cinematic hero */}
        <FeaturedEventHero
          eventSlides={heroEventSlides}
          highlightSlides={heroHighlightSlides}
          liveEventCount={liveEventCount ?? 0}
          uniqueCitiesCount={uniqueCitiesCount}
        />

        {/* 2. Bento grid row 1 — cream, follows hero (colour change) → DEFAULT */}
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
                  <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
                    The lineup
                  </p>
                  <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                    What everyone is buying into
                  </h2>
                </div>
              </div>
              <Link
                href="/events"
                className="shrink-0 text-sm font-medium text-gold-500 whitespace-nowrap transition-colors hover:text-gold-600"
              >
                View all events &rsaquo;
              </Link>
            </div>

            <div className={HEADER_TO_CONTENT}>
              {featuredHero ? (
                <BentoGrid>
                  <BentoTile size="hero">
                    {featuredHero && (
                      <EventBentoTile
                        event={featuredHero as BentoEvent}
                        size="hero"
                        useVideoFallback
                        featured
                        initiallySaved={savedEventIds.has(featuredHero.id)}
                      />
                    )}
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
                      className="mt-5 inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
                    >
                      List your event
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. This Week rail — cream-on-cream after Bento → TIGHT */}
        {thisWeek.length > 0 && (
          <section aria-label="This week" className={`bg-canvas ${SECTION_TIGHT}`}>
            <div className={CONTAINER}>
              <SnapRail
                eyebrow="This week"
                title="What's happening near you"
                headerLink={{ href: '/events?date=week', label: 'View all' }}
                railLabel="Events this week"
                containerBg="canvas"
              >
                {thisWeekCards}
              </SnapRail>
            </div>
          </section>
        )}

        {/* 4. Cultural Picks — cream-on-cream → TIGHT */}
        {culturalPicksTabs.length > 0 && (
          <section aria-labelledby="culture-heading" className={`bg-canvas ${SECTION_TIGHT}`}>
            <div className={CONTAINER}>
              <div className="flex items-end justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
                  <div>
                    <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
                      Made for the diaspora
                    </p>
                    <h2 id="culture-heading" className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                      Cultural picks
                    </h2>
                  </div>
                </div>
                <Link
                  href="/events"
                  className="shrink-0 text-sm font-medium text-gold-500 whitespace-nowrap transition-colors hover:text-gold-600"
                >
                  Explore culture &rsaquo;
                </Link>
              </div>

              <CulturalPicksRail tabs={culturalPicksTabs} />
            </div>
          </section>
        )}

        {/* 5. Live Vibe marquee */}
        <LiveVibeMarquee items={vibeImages} />

        {/* 6. By City rail — cream, follows dark marquee (colour change) → DEFAULT */}
        <section aria-labelledby="cities-heading" className={`bg-canvas ${SECTION_DEFAULT}`}>
          <div className={CONTAINER}>
            <SnapRail
              eyebrow="By city"
              title="Browse by city"
              headingId="cities-heading"
              railLabel="Events by city"
              containerBg="canvas"
            >
              {cityCounts.map(c => (
                <CityRailTile
                  key={c.slug}
                  city={c.city}
                  slug={c.slug}
                  eventCount={c.count}
                  imageSrc={c.imageSrc}
                />
              ))}
            </SnapRail>
          </div>
        </section>

        {/* 7. For Organisers — dark, follows cream (colour change) → DEFAULT */}
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
                    className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
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
