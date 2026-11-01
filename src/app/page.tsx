import { Suspense } from 'react'
import type { Metadata } from 'next'
import { FeaturedRow } from '@/components/features/promotions/featured-row'
import { featuredForPage } from '@/lib/promotions/promotions'
import { CommunityRail } from '@/components/features/home/community-rail'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import { CityGuideScreen } from '@/components/features/city-guide/city-guide-screen'
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

/**
 * THE HOME IS THE CITY GUIDE (the city-first directive of 1 November 2026): one city, chosen first, never mixed. It
 * opens on Geelong, the directive's reference city, with every other city one tap away. Below the guide, the paid
 * Featured slots, the community thread (the homepage community moat) and every city.
 */
export default async function HomePage() {
  const nowIso = new Date().toISOString()
  const featured = await featuredForPage('homepage')
  return (
    <CityGuideScreen
      citySlug="geelong"
      after={
        <>
          <FeaturedRow items={featured} where="homepage" />
          <CommunityRail />
          <Suspense fallback={<CityRailSkeleton />}>
            <CityRailSection nowIso={nowIso} />
          </Suspense>
        </>
      }
    />
  )
}
