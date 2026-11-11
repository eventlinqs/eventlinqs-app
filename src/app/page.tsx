import { Suspense } from 'react'
import type { Metadata } from 'next'
import { FeaturedRow } from '@/components/features/promotions/featured-row'
import { featuredForPage } from '@/lib/promotions/promotions'
import { CommunityRail } from '@/components/features/home/community-rail'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import { CityGuideScreen } from '@/components/features/city-guide/city-guide-screen'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { CityRailSkeleton } from '@/components/features/home/section-skeletons'
import { AFTER_THE_GUIDE } from '@/lib/home/after-the-guide'

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

// ISR: re-render every 2 minutes. The homepage ships a static, anonymous
// shell - no cookies/headers in the render path - so Next.js can promote
// it to ISR. Per-user personalisation (saved-events badge, location
// picker city) is hydrated client-side from cookies post-paint.
export const revalidate = 120

// Batch 9 V2 SEO contract: title format from the brief, full Open Graph
// and Twitter Card with 1200x630 hero image, and canonical URL. UNSOURCED (Law 7)
// THE HOME READS AS A WHAT'S ON GUIDE (Lawal's design notes of 1 November 2026, 19:17, (1); the CONTROLLER's 19:19;
// C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md): the page is the Geelong guide, so its title and cards say
// what is on, not the community first platform line. The brand tagline itself stays where it is (one source,
// src/lib/brand/positioning.ts); only this page's own words changed.
export const metadata: Metadata = {
  title: 'What’s on in Geelong: gigs, sport, markets and things to do | EventLinqs',
  description:
    'Everything on in Geelong, day by day: music, sport, comedy, nightlife, markets, food and drink, family and arts, each with its time, venue, price and where to book. Switch to Melbourne, Ballarat, Bendigo or any Australian city in one tap. EventLinqs is where events get made.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    title: 'What’s on in Geelong: gigs, sport, markets and things to do | EventLinqs',
    description:
      'Everything on in Geelong, day by day: music, sport, comedy, nightlife, markets, food and drink, family and arts, each with its time, venue, price and where to book. Switch to Melbourne, Ballarat, Bendigo or any Australian city in one tap. EventLinqs is where events get made.',
    siteName: 'EventLinqs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'What’s on in Geelong: gigs, sport, markets and things to do | EventLinqs',
    description:
      'Everything on in Geelong, day by day, with the price and where to book. EventLinqs is where events get made.',
  },
}

/**
 * THE HOME IS THE CITY GUIDE (the city-first directive of 1 November 2026): one city, chosen first, never mixed. It
 * opens on Geelong, the directive's reference city, with every other city one tap away. Below the guide, in the order
 * a visitor finding what's on uses them (Lawal's design notes of 19:17, (2)): the paid Featured slots, every city, and
 * the community thread LAST, never dominating. Each is a flag in src/lib/home/after-the-guide.ts: a section that stops
 * helping a visitor find what's on is switched off there, never deleted, so it can come back.
 */
const EXPERIMENT_NO_AFTER = true

export default async function HomePage() {
  const nowIso = new Date().toISOString()
  const featured = await featuredForPage('homepage')
  return (
    <CityGuideScreen
      citySlug="geelong"
      heroImage={await getCityHeroPhoto('geelong')}
      after={
        // EXPERIMENT 2 (11 November 2026, never merged): nothing after the guide, to bisect the cached home's #418.
        EXPERIMENT_NO_AFTER ? null : <>
          {AFTER_THE_GUIDE.featuredSlots ? <FeaturedRow items={featured} where="homepage" /> : null}
          {AFTER_THE_GUIDE.everyCity ? (
            <Suspense fallback={<CityRailSkeleton />}>
              <CityRailSection nowIso={nowIso} />
            </Suspense>
          ) : null}
          {AFTER_THE_GUIDE.communities ? <CommunityRail /> : null}
        </>
      }
    />
  )
}
