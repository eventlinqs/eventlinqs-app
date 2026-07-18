import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { FeaturedHero } from '@/components/features/home/FeaturedHero'
import { HomeSchemaJsonLd } from '@/components/features/home/home-schema-jsonld'
import { CategoryNavRail } from '@/components/features/home/category-nav-rail'
import { SoundsRail } from '@/components/features/home/sounds-rail'
import { CommunityRail } from '@/components/features/home/community-rail'
import { CommunityValueBand } from '@/components/features/home/community-value-band'
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
 *   5. Community Picks (below fold) - Suspense-streamed (self-fetching)
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

  // Market-ready volume law: a rail with one or two cards next to full rails
  // reads as emptiness, not curation. A category rail renders only from three
  // events; thinner categories stay reachable through Browse by Category and
  // the events browse, where a short list reads as a list, not a defect.
  const RAIL_MIN = 3

  // Live counts per category for the category nav tiles under the hero.
  const categoryCounts = upcoming.reduce<Record<string, number>>((acc, e) => {
    const slug = e.category?.slug
    if (slug) acc[slug] = (acc[slug] ?? 0) + 1
    return acc
  }, {})

  const musicEvents = byCategory('music')
  const foodEvents = byCategory('food-drink')
  const festivalEvents = byCategory('festival')
  const artsEvents = byCategory('arts-community')
  const nightlifeEvents = byCategory('nightlife')
  const comedyEvents = byCategory('comedy')
  const sportsEvents = byCategory('sports')
  const familyEvents = byCategory('family')

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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

  return (
    <div className="min-h-screen bg-canvas">
      <HomeSchemaJsonLd baseUrl={baseUrl} />
      <SiteHeader />

      <main>
        {/* H1 - FeaturedHero: one strong, real featured event at a time,
         *  roughly half the old hero height. SSR priority AVIF raster as
         *  the LCP layer, restrained scrim, single CTA. With two or three
         *  featured events the hero auto-rotates every ~6.5s with an eased
         *  crossfade (Hero Carousel law: pauses on hover/touch/focus, gated
         *  on the motion flag, manual arrows and dots always available).
         *  This is the only homepage surface where text sits on a photo. */}
        <FeaturedHero events={upcoming} />

        {/* Trust band removed Batch 11.0. The 2026 contextual-trust
         *  pattern places trust signals at the purchase-decision moment
         *  (event detail page + checkout) rather than as a sitewide
         *  band. See docs/redesign/batch-11-evidence/trust-signals-2026.md. */}

        {/* The placeholder Community Calendar widget and Featured Organisers
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

        {/* ── Community moat (HIGH placement, within the first two screens) ──
         *  The differentiating layer no competitor has, surfaced early but never
         *  dominant. Real /community/[slug] landings, First Nations first. Self-
         *  fetches the heritage index; renders nothing if empty. Stripped out,
         *  the page still stands as a full general ticketing rival. */}
        <CommunityRail />

        {/* General category breadth leads. */}
        {musicEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="On the lineup"
            title="Music"
            ariaLabel="Music events"
            railLabel="Music events"
            events={musicEvents}
            viewAllHref="/events?category=music"
          />
        )}

        {foodEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="Taste the city"
            title="Food and drink"
            ariaLabel="Food and drink events"
            railLabel="Food and drink events"
            events={foodEvents}
            viewAllHref="/events?category=food-drink"
          />
        )}

        {/* Trending (general, demand-based) - Variant B: the one larger
            feature-card row. Uniform feature-sized cards within the rail. */}
        {trending.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="Selling fast"
            title="Trending now"
            ariaLabel="Trending events"
            railLabel="Trending events"
            events={trending}
            viewAllHref="/events?sort=popularity"
            cardVariant="feature"
          />
        )}

        {festivalEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="All day, all weekend"
            title="Festivals"
            ariaLabel="Festival events"
            railLabel="Festival events"
            events={festivalEvents}
            viewAllHref="/events?category=festival"
          />
        )}

        {artsEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="On stage and in the gallery"
            title="Arts and theatre"
            ariaLabel="Arts and theatre events"
            railLabel="Arts and theatre events"
            events={artsEvents}
            viewAllHref="/events?category=arts-community"
          />
        )}

        {/* This Weekend (general, time-based) */}
        {thisWeekend.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="This weekend"
            title="On this weekend"
            ariaLabel="Events this weekend"
            railLabel="Events this weekend"
            invitationSubject="weekend"
            events={thisWeekend}
            viewAllHref="/events?preset=weekend"
          />
        )}

        {nightlifeEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="After dark"
            title="Nightlife"
            ariaLabel="Nightlife events"
            railLabel="Nightlife events"
            events={nightlifeEvents}
            viewAllHref="/events?category=nightlife"
          />
        )}

        {comedyEvents.length >= RAIL_MIN && (
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
        {freeEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="No ticket needed"
            title="Free events"
            ariaLabel="Free events"
            railLabel="Free events"
            events={freeEvents}
            viewAllHref="/events?preset=free"
          />
        )}

        {/* Sounds (genres) - the genre half of the old combined scene rail.
         *  The community half is the higher-placed CommunityRail above. */}
        <SoundsRail />

        {/* The ONE community value band: tinted surface, locked tagline, real
         *  community tiles into /community/[slug], CTA into the /communities hub. The
         *  lower bookend of the community moat. */}
        <CommunityValueBand />

        {/* General breadth continues below the community thread. */}
        {sportsEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="Game on"
            title="Sport"
            ariaLabel="Sport events"
            railLabel="Sport events"
            events={sportsEvents}
            viewAllHref="/events?category=sports"
          />
        )}

        {familyEvents.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="Bring everyone"
            title="Family"
            ariaLabel="Family events"
            railLabel="Family events"
            events={familyEvents}
            viewAllHref="/events?category=family"
          />
        )}

        {/* Business and networking rail removed from the homepage (founder
         *  ruling): lowest consumer-discovery intent of the category rails. It
         *  stays a Browse-by-Category tile and keeps its category page. */}

        {/* Browse by City */}
        <Suspense fallback={<CityRailSkeleton />}>
          <CityRailSection nowIso={nowIso} />
        </Suspense>

        {/* Editorial tail */}
        {justAdded.length >= RAIL_MIN && (
          <EventRailSection
            eyebrow="Just added"
            title="Fresh on the platform"
            ariaLabel="Recently added events"
            railLabel="Recently added events"
            invitationSubject="fresh"
            events={justAdded}
            viewAllHref="/events?sort=date_asc"
          />
        )}

        {/* "Editor's picks" rail removed in the community-moat pass: it was a
         *  dedup-one-per-category set (lowest editorial signal). Cutting it
         *  offsets the added community rail so the page does not grow longer. */}

        <FeaturedVenuesSection upcoming={upcomingRawTyped} />
      </main>

      <SiteFooter />
    </div>
  )
}
