import { Suspense } from 'react'
import { FeaturedRow } from '@/components/features/promotions/featured-row'
import { featuredForPage } from '@/lib/promotions/promotions'
import { CommunityRail } from '@/components/features/home/community-rail'
import { CityRailSection } from '@/components/features/home/city-rail-section'
import { CityGuideScreen } from '@/components/features/city-guide/city-guide-screen'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { CityRailSkeleton } from '@/components/features/home/section-skeletons'
import { AFTER_THE_GUIDE } from '@/lib/home/after-the-guide'

/*
 * THE GUIDE HOME, KEPT WHOLE BEHIND SITE_LOOK.marketplaceHome (law 13; moved here unchanged from src/app/page.tsx on
 * 21 November 2026, train AU, when the marketplace home took the page). chosen-home.ts picks which one / renders.
 */
/**
 * THE HOME IS THE CITY GUIDE (the city-first directive of 1 November 2026): one city, chosen first, never mixed. It
 * opens on MELBOURNE (Lawal, 12 November 2026, 09:16 to 09:19: 'Melbourne is bigger than Geelong ... Geelong is not the
 * criteria ... Melbourne wins'; every organiser so far and every rights recorded photograph is in Melbourne), with
 * every other city one tap away. Geelong keeps /city/geelong, its own canonical and its sitemap entry, untouched. Below the guide, in the order
 * a visitor finding what's on uses them (Lawal's design notes of 19:17, (2)): the paid Featured slots, every city, and
 * the community thread LAST, never dominating. Each is a flag in src/lib/home/after-the-guide.ts: a section that stops
 * helping a visitor find what's on is switched off there, never deleted, so it can come back.
 */
export async function CityGuideHome() {
  const nowIso = new Date().toISOString()
  const featured = await featuredForPage('homepage')
  return (
    <CityGuideScreen
      citySlug="melbourne"
      heroImage={await getCityHeroPhoto('melbourne')}
      after={
        <>
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
