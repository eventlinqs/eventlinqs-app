import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { FeaturedRow } from '@/components/features/promotions/featured-row'
import { featuredForPage } from '@/lib/promotions/promotions'
import { SoundsRail } from '@/components/features/home/sounds-rail'
import { CommunityRail } from '@/components/features/home/community-rail'
import { CommunityValueBand } from '@/components/features/home/community-value-band'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { loadHomeUpcoming } from '@/lib/events/home-queries'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import { Discovery, DISCOVERY_CITIES, type DiscoveryVariant } from '@/components/features/discovery/discovery'
import { discoveryData } from '@/lib/events/discovery-data'
import type { LedgerRow } from '@/lib/events/ledger-data'
import { FeaturedVenuesSection } from '@/components/features/home/featured-venues-section'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { CityRailSkeleton } from '@/components/features/home/section-skeletons'

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
// and Twitter Card with 1200x630 hero image, and canonical URL. UNSOURCED (Law 7)
export const metadata: Metadata = {
  title: 'EventLinqs - Every community. Every event. One platform.',
  description:
    'Discover live events across Australia: music, food and drink, festivals, comedy, theatre, arts, nightlife, sports and family, plus the community scenes you follow. EventLinqs is where events get made.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    title: 'EventLinqs - Every community. Every event. One platform.',
    description:
      'Discover live events from communities across Australia. EventLinqs is where events get made: find your suppliers, sell your tickets, run your door and get paid.',
    siteName: 'EventLinqs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EventLinqs - Every community. Every event. One platform.',
    description:
      'Discover live events from communities across Australia. The place events get made.',
  },
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ v?: string; city?: string }> }) {
  // THE THREE DISCOVERY VARIANTS ON ONE LINK (the brief of 1 November 2026, section 6): ?v=a|b|c, and ?city= for the
  // city the page opens on (Victoria, the overview, when none is named).
  const sp = await searchParams
  const variant: DiscoveryVariant = sp.v === 'b' || sp.v === 'c' ? sp.v : 'a'
  const initialCity = DISCOVERY_CITIES.some((c) => c.key === sp.city) ? (sp.city as string) : 'victoria'
  const supabase = createPublicClient()
  const nowIso = new Date().toISOString()

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
  // EVERY VISIBLE NIGHT, NOT THE 60 SOONEST (Lawal's emergency correction, 31 October 2026, 17:44; WINDOW 6's audit,
  // C:\dev\EVIDENCE\INVENTORY-31OCT\audit.md). The limit was 60: those ended on 10 November while the 318 visible ran to
  // 26 December, so Music drew 2 of its 46, Food and drink 1 of 8, Festivals 1 of 10, and the rest of each rail was
  // open-slot filler. Each rail below now chooses from the whole visible inventory, by its own category, place and date.
  const upcomingRawTyped = await loadHomeUpcoming(supabase, nowIso, 1000)
  // The hero keeps the rows as read: it leads only with a night's own photograph (FeaturedHero, isOwnPhoto), so a
  // venue's photograph never stands under a night's name there. Every rail takes the card image chain.
  const upcomingWithPhotos = (await withVenuePhotos(upcomingRawTyped)) as LedgerRow[]
  const discovery = await discoveryData(upcomingWithPhotos, new Date(nowIso))
  const featured = await featuredForPage('homepage')

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        <Discovery
          variant={variant}
          initialCity={initialCity}
          rows={discovery.rows}
          featured={discovery.featured}
          days={discovery.days}
          categories={discovery.categories}
        />

        {/* Paid featured slots (Train C, row 12), headed and labelled Featured, never inside the unpaid rails. */}
        <FeaturedRow items={featured} where="homepage" />

        <CommunityRail />

        <SoundsRail />

        <CommunityValueBand />

        <Suspense fallback={<CityRailSkeleton />}>
          <CityRailSection nowIso={nowIso} />
        </Suspense>

        <FeaturedVenuesSection upcoming={upcomingRawTyped} />
      </main>

      <SiteFooter />
    </div>
  )
}
