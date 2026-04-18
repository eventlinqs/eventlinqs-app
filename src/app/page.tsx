import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { FeaturedEventHero } from '@/components/features/events/featured-event-hero'
import type { FeaturedHeroEvent } from '@/components/features/events/featured-event-hero'
import { BentoGrid, BentoTile } from '@/components/features/events/bento-grid'
import { EventBentoTile } from '@/components/features/events/event-bento-tile'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { FreeWeekendTile } from '@/components/features/events/free-weekend-tile'
import { ThisWeekStrip } from '@/components/features/events/this-week-strip'
import { LiveVibeMarquee, type VibeSignal } from '@/components/features/events/live-vibe-marquee'
import { CityTile } from '@/components/features/events/city-tile'
import { getCityPhoto } from '@/lib/images/city-photo'

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
  'id, slug, title, summary, cover_image_url, thumbnail_url, gallery_urls, start_date, venue_name, venue_city, venue_country, is_free, created_at, category:event_categories(name, slug), organisation:organisations(name), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

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
  { city: 'Melbourne', slug: 'melbourne' },
  { city: 'Sydney',    slug: 'sydney' },
  { city: 'London',    slug: 'london' },
  { city: 'Lagos',     slug: 'lagos' },
]

export default async function HomePage() {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  const nowMs = Date.parse(nowIso)

  const weekEndIso = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Upcoming public events — pull 24 to fuel hero + bento + cultural tabs + This Week
  const { data: upcomingRaw } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .order('start_date', { ascending: true })
    .limit(24)

  const upcoming = ((upcomingRaw ?? []) as unknown as RawRow[]).map(toBentoEvent)
  const upcomingRawTyped = (upcomingRaw ?? []) as unknown as RawRow[]

  // Featured event (soonest upcoming) for cinematic hero + hero bento tile
  const featuredRaw = upcomingRawTyped[0] ?? null
  const featuredHero: FeaturedHeroEvent | null = featuredRaw ? toFeaturedHeroEvent(featuredRaw) : null

  // Bento row: featured + 3 supporting events
  const supportingOne = upcoming[1] ?? null
  const supportingTwo = upcoming[2] ?? null

  // Free weekend tile — first free event in the next 7 days
  const weekendFree = upcoming.find(
    e => (e.is_free === true || (e.ticket_tiers ?? []).every(t => t.price === 0)) && new Date(e.start_date) <= new Date(weekEndIso),
  ) ?? null

  // This Week — events within next 7 days
  const thisWeek = upcoming.filter(e => new Date(e.start_date) <= new Date(weekEndIso)).slice(0, 10)

  // Cultural picks per tab — fetch in parallel using tag overlaps
  const culturalQueries = await Promise.all(
    CULTURE_TABS.map(async tab => {
      const { data } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', nowIso)
        .contains('tags', [tab.tag])
        .order('start_date', { ascending: true })
        .limit(4)
      return {
        tab,
        events: ((data ?? []) as unknown as RawRow[]).map(toBentoEvent),
      }
    }),
  )

  const populatedCulturalQueries = culturalQueries.filter(q => q.events.length > 0)

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

  // Live Vibe signals — platform activity, derived from upcoming inventory
  const signals: VibeSignal[] = []
  for (const raw of upcomingRawTyped.slice(0, 10)) {
    const tiers = raw.ticket_tiers ?? []
    const sold = tiers.reduce((s, t) => s + t.sold_count, 0)
    const cap = tiers.reduce((s, t) => s + t.total_capacity, 0)
    const pct = cap > 0 ? Math.round((sold / cap) * 100) : 0
    const daysTo = Math.ceil((new Date(raw.start_date).getTime() - nowMs) / 86400000)
    const href = `/events/${raw.slug}`

    if (pct >= 70) {
      signals.push({ glyph: '\uD83D\uDD25', text: `${raw.title}: ${pct}% sold`, href })
    } else if (daysTo >= 0 && daysTo <= 5) {
      signals.push({
        glyph: '\u23F0',
        text: daysTo === 0 ? `${raw.title} tonight` : `${raw.title}: ${daysTo} days to go`,
        href,
      })
    } else if (raw.venue_city) {
      signals.push({ glyph: '\uD83D\uDCCD', text: `New in ${raw.venue_city}: ${raw.title}`, href })
    } else {
      signals.push({ glyph: '\u2728', text: `New listing: ${raw.title}`, href })
    }
  }
  if (signals.length === 0) {
    signals.push(
      { glyph: '\u2728', text: 'New events dropping every week in Melbourne, Sydney, London and Lagos' },
      { glyph: '\uD83C\uDFAB', text: 'Afrobeats nights, Amapiano fests, Comedy rooms. Tickets with no hidden fees.' },
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        {/* 1. Cinematic hero */}
        <FeaturedEventHero event={featuredHero} />

        {/* 2. Bento grid row 1 */}
        <section aria-label="Featured events" className="bg-canvas py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

            <div className="mt-8">
              {featuredHero ? (
                <BentoGrid>
                  <BentoTile size="hero">
                    {featuredHero && (
                      <EventBentoTile
                        event={featuredHero as BentoEvent}
                        size="hero"
                        useVideoFallback
                        featured
                      />
                    )}
                  </BentoTile>

                  <BentoTile size="wide">
                    {supportingOne && <EventBentoTile event={supportingOne} size="wide" />}
                  </BentoTile>

                  <BentoTile size="standard">
                    {supportingTwo && <EventBentoTile event={supportingTwo} size="standard" />}
                  </BentoTile>

                  <BentoTile size="compact">
                    <FreeWeekendTile event={weekendFree} fallbackMode={!weekendFree} />
                  </BentoTile>
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

        {/* 3. This Week strip */}
        {thisWeek.length > 0 && (
          <section aria-label="This week" className="bg-canvas pb-14 sm:pb-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
                  <div>
                    <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
                      This week
                    </p>
                    <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                      What&apos;s happening near you
                    </h2>
                  </div>
                </div>
                <Link
                  href="/events?date=week"
                  className="shrink-0 text-sm font-medium text-gold-500 whitespace-nowrap transition-colors hover:text-gold-600"
                >
                  View all &rsaquo;
                </Link>
              </div>
              <div className="mt-8">
                <ThisWeekStrip events={thisWeek} />
              </div>
            </div>
          </section>
        )}

        {/* 4. Cultural Picks — bento per tab */}
        {populatedCulturalQueries.length > 0 && (
          <section aria-labelledby="culture-heading" className="bg-ink-100 py-14 sm:py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

              {/* Tab strip — first populated tab active by default. */}
              <div className="mt-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {populatedCulturalQueries.map(({ tab }, i) => (
                  <a
                    key={tab.slug}
                    href={`#culture-${tab.slug}`}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                      i === 0
                        ? 'bg-gold-500 border-gold-500 text-white'
                        : 'bg-white border-ink-200 text-ink-700 hover:border-gold-400 hover:text-gold-600'
                    }`}
                  >
                    {tab.label}
                  </a>
                ))}
              </div>

              <div className="mt-8 space-y-10">
                {populatedCulturalQueries.map(({ tab, events }) => (
                  <div key={tab.slug} id={`culture-${tab.slug}`} className="scroll-mt-24">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-xl font-bold text-ink-900">{tab.label}</h3>
                      <Link
                        href={tab.href}
                        className="text-xs font-medium text-gold-500 transition-colors hover:text-gold-600"
                      >
                        View all {tab.label} &rsaquo;
                      </Link>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12 md:auto-rows-[130px]">
                      {events[0] && (
                        <div className="md:col-span-8 md:row-span-3 min-h-[260px] relative overflow-hidden rounded-2xl">
                          <EventBentoTile event={events[0]} size="wide" />
                        </div>
                      )}
                      {events.slice(1, 4).map(e => (
                        <div key={e.id} className="md:col-span-4 md:row-span-3 min-h-[220px] relative overflow-hidden rounded-2xl">
                          <EventBentoTile event={e} size="standard" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 5. By City */}
        <section aria-labelledby="cities-heading" className="bg-canvas py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
                  By city
                </p>
                <h2 id="cities-heading" className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                  Wherever you are, the culture follows
                </h2>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cityCounts.map(c => (
                <CityTile
                  key={c.slug}
                  city={c.city}
                  slug={c.slug}
                  eventCount={c.count}
                  imageSrc={c.imageSrc}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 6. Live Vibe marquee */}
        <LiveVibeMarquee signals={signals} />

        {/* 7. For Organisers */}
        <section aria-labelledby="organisers-heading" className="bg-ink-900 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
