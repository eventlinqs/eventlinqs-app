import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { FeaturedHero } from '@/components/features/home/FeaturedHero'
import { HomeSchemaJsonLd } from '@/components/features/home/home-schema-jsonld'
import { CategoryNavRail } from '@/components/features/home/category-nav-rail'
import { SceneRail } from '@/components/features/home/scene-rail'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import {
  loadHomeUpcoming,
  toBentoEvent,
} from '@/lib/events/home-queries'
import { ThisWeekSection } from '@/components/features/home/this-week-section'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import { EventRailSection } from '@/components/features/home/event-rail-section'
import { FeaturedVenuesSection } from '@/components/features/home/featured-venues-section'
import {
  ThisWeekSkeleton,
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
    'Discover live events across Australia: music, food and drink, festivals, comedy, theatre, arts, nightlife, sports and family, plus the community scenes you follow. No hidden fees, verified organisers, fair refund policy.',
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

  // ── Above-fold data ──────────────────────────────────────────────────
  // One query feeds the hero plus every below-fold rail (each derived by
  // slicing this list). The homepage is a static, anonymous shell, no city
  // filter, no session, no per-user query; SiteHeader and the saved-events
  // button hydrate user state post-mount.
  //
  // Source: loadHomeUpcoming queries Supabase normally, and only under the
  // dev flag HOMEPAGE_SEED_FIXTURE=1 returns the local general-breadth
  // catalogue so the page can be built and benchmarked at full density while
  // staging is not yet provisioned.
  const upcomingRawTyped = await loadHomeUpcoming(supabase, nowIso, 60)
  const upcoming = upcomingRawTyped.map(toBentoEvent)

  void nowMs

  // General category breadth: the page leads with these, the way a general
  // ticketing platform does. Each rail self-hides when it has no events.
  const byCategory = (slug: string, max = 12) =>
    upcoming.filter(e => e.category?.slug === slug).slice(0, max)

  // Live counts per category for the category nav tiles under the hero.
  const categoryCounts = upcoming.reduce<Record<string, number>>((acc, e) => {
    const slug = e.category?.slug
    if (slug) acc[slug] = (acc[slug] ?? 0) + 1
    return acc
  }, {})

  const musicEvents = byCategory('music')
  const foodEvents = byCategory('food-drink')
  const festivalEvents = byCategory('festival')
  const artsEvents = byCategory('arts-culture')
  const nightlifeEvents = byCategory('nightlife')
  const comedyEvents = byCategory('comedy')
  const sportsEvents = byCategory('sports')
  const familyEvents = byCategory('family')
  const businessEvents = byCategory('business-networking')

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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

  return (
    <div className="min-h-screen bg-canvas">
      <HomeSchemaJsonLd baseUrl={baseUrl} />
      <SiteHeader />

      <main>
        {/* H1 - FeaturedHero: one strong, real featured event at a time,
         *  roughly half the old hero height. SSR priority AVIF raster as
         *  the LCP layer, restrained scrim, single CTA. When two or three
         *  featured events exist the visitor steps between them with arrows
         *  and dots - user-controlled only, never auto-rolling. This is the
         *  only homepage surface where text sits on a photo. */}
        <FeaturedHero events={upcoming} />

        {/* Trust band removed Batch 11.0. The 2026 contextual-trust
         *  pattern places trust signals at the purchase-decision moment
         *  (event detail page + checkout) rather than as a sitewide
         *  band. See docs/redesign/batch-11-evidence/trust-signals-2026.md. */}

        {/* The placeholder Cultural Calendar widget and Featured Organisers
         *  row were removed to keep the homepage reading like a premium
         *  ticketing platform (real event rails, not editorial placeholders). */}

        {/* H2 Browse by category: image-tile category entry under the hero,
         *  in the locked system (separated tile, label below the image, no
         *  pills). Replaces the early-concept CategoryChipStrip. */}
        <CategoryNavRail counts={categoryCounts} />

        {/* Empty-state only: with zero upcoming events every rail below
         *  self-hides, so this stands in for the catalogue. */}
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

        {/*
         * STRUCTURE (strategic correction, 6 June 2026):
         * EventLinqs is a complete general ticketing platform first. General
         * category breadth LEADS the page, the way Ticketmaster and Eventbrite
         * do it. Community is one curated thread (SceneRail) placed mid-page,
         * never the lead. Strip the SceneRail out and the page still stands as
         * a full general ticketing rival. Each rail self-hides when empty.
         */}

        {/* Lead rail: This Week (general, time-based) */}
        <Suspense fallback={<ThisWeekSkeleton />}>
          <ThisWeekSection events={thisWeek} />
        </Suspense>

        {/* General category breadth leads. */}
        {musicEvents.length >= 1 && (
          <EventRailSection
            eyebrow="On the lineup"
            title="Music"
            ariaLabel="Music events"
            railLabel="Music events"
            events={musicEvents}
            viewAllHref="/events?category=music"
          />
        )}

        {foodEvents.length >= 1 && (
          <EventRailSection
            eyebrow="Taste the city"
            title="Food and drink"
            ariaLabel="Food and drink events"
            railLabel="Food and drink events"
            events={foodEvents}
            viewAllHref="/events?category=food-drink"
          />
        )}

        {/* Trending (general, demand-based) */}
        {trending.length >= 1 && (
          <EventRailSection
            eyebrow="Selling fast"
            title="Trending now"
            ariaLabel="Trending events"
            railLabel="Trending events"
            events={trending}
            viewAllHref="/events?sort=popularity"
          />
        )}

        {festivalEvents.length >= 1 && (
          <EventRailSection
            eyebrow="All day, all weekend"
            title="Festivals"
            ariaLabel="Festival events"
            railLabel="Festival events"
            events={festivalEvents}
            viewAllHref="/events?category=festival"
          />
        )}

        {artsEvents.length >= 1 && (
          <EventRailSection
            eyebrow="On stage and in the gallery"
            title="Arts and theatre"
            ariaLabel="Arts and theatre events"
            railLabel="Arts and theatre events"
            events={artsEvents}
            viewAllHref="/events?category=arts-culture"
          />
        )}

        {/* This Weekend (general, time-based) */}
        {thisWeekend.length >= 1 && (
          <EventRailSection
            eyebrow="This weekend"
            title="On this weekend"
            ariaLabel="Events this weekend"
            railLabel="Events this weekend"
            events={thisWeekend}
            viewAllHref="/events?preset=weekend"
          />
        )}

        {nightlifeEvents.length >= 1 && (
          <EventRailSection
            eyebrow="After dark"
            title="Nightlife"
            ariaLabel="Nightlife events"
            railLabel="Nightlife events"
            events={nightlifeEvents}
            viewAllHref="/events?category=nightlife"
          />
        )}

        {comedyEvents.length >= 1 && (
          <EventRailSection
            eyebrow="Have a laugh"
            title="Comedy"
            ariaLabel="Comedy events"
            railLabel="Comedy events"
            events={comedyEvents}
            viewAllHref="/events?category=comedy"
          />
        )}

        {/* Free (general, price-based) */}
        {freeEvents.length >= 1 && (
          <EventRailSection
            eyebrow="No ticket needed"
            title="Free events"
            ariaLabel="Free events"
            railLabel="Free events"
            events={freeEvents}
            viewAllHref="/events?preset=free"
          />
        )}

        {/* ── Community thread (one rail, mid-page) ──────────────────────
         *  The single community/scene moment: Afrobeats, Amapiano, Gospel,
         *  Caribbean, Owambe, Heritage & Independence, Business & Networking.
         *  This is the differentiating layer, roughly 10-20% of the page,
         *  not its identity. It sits here, after the general breadth, never
         *  at the lead. */}
        <SceneRail />

        {/* General breadth continues below the community thread. */}
        {sportsEvents.length >= 1 && (
          <EventRailSection
            eyebrow="Game on"
            title="Sport"
            ariaLabel="Sport events"
            railLabel="Sport events"
            events={sportsEvents}
            viewAllHref="/events?category=sports"
          />
        )}

        {familyEvents.length >= 1 && (
          <EventRailSection
            eyebrow="Bring everyone"
            title="Family"
            ariaLabel="Family events"
            railLabel="Family events"
            events={familyEvents}
            viewAllHref="/events?category=family"
          />
        )}

        {businessEvents.length >= 1 && (
          <EventRailSection
            eyebrow="Make the connection"
            title="Business and networking"
            ariaLabel="Business and networking events"
            railLabel="Business and networking events"
            events={businessEvents}
            viewAllHref="/events?category=business-networking"
          />
        )}

        {/* Browse by City */}
        <Suspense fallback={<CityRailSkeleton />}>
          <CityRailSection nowIso={nowIso} />
        </Suspense>

        {/* Editorial tail */}
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

        <FeaturedVenuesSection upcoming={upcomingRawTyped} />
      </main>

      <SiteFooter />
    </div>
  )
}
