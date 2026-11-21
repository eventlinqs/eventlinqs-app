import { cache } from 'react'
import type { Metadata } from 'next'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { WeekendGuide } from '@/components/features/weekend/weekend-guide'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { emptyWeekendGuide, readWeekendGuide } from '@/lib/newsletter/edition'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import { getSpineCity } from '@/lib/images/spine'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'

/**
 * /weekend, THE WEEKEND GUIDE, VICTORIA (law 46 (b), Lawal's design B of 21 November 2026; the PM's 08:48 item 3). This
 * weekend's nights still listed across Victoria's guide cities, picked and pictured by the newsletter's own rules
 * (src/lib/newsletter/edition.ts readWeekendGuide). Rendered at most five minutes old, and a night leaves it at its end:
 * the ending purge revalidates /weekend with every Victorian night it purges (src/lib/events/revalidate-event.ts, law 16).
 * Not offered to search engines yet ('never' in src/lib/seo/indexing-policy.ts): /this-weekend is the indexed weekend
 * surface until it is folded into this page (law 13), so the two never compete as duplicates.
 */
export const revalidate = 300

/** One read for the metadata and the page in a render. */
// NO SERVICE-ROLE KEY, NO ADMIN READ (#331's CI build, 21 November 2026: 'supabaseKey is required' prerendering /weekend;
// the rule src/lib/events/featured-with-recorded-rights.ts holds since car 35): the CI build carries only NEXT_PUBLIC
// values, so there the page renders its thin weekend. Wherever the key exists, nothing changes.
const guideNow = cache(async () => {
  if (!getSupabaseServiceRoleKey()) {
    console.warn('[weekend] no service-role key on this host; the weekend is not read')
    return emptyWeekendGuide(new Date())
  }
  return readWeekendGuide(createAdminClient(), { now: new Date(), origin: getSiteUrl() })
})

export async function generateMetadata(): Promise<Metadata> {
  const title = 'The Weekend Guide, Victoria | EventLinqs'
  const description = "This weekend's best events across Victoria: festivals, live music, comedy, family days and free things to do, picked for you."
  // No canonical: a noindex page that names one sends a crawler two instructions (src/lib/seo/indexing-policy.ts).
  return { title, description, ...noIndexMetadata(), openGraph: { title, description, url: '/weekend', type: 'website', images: ['/opengraph-image'] } }
}

export default async function WeekendPage() {
  const origin = getSiteUrl()
  const guide = await guideNow()
  // The licensed library's own scenic photographs (src/lib/images/spine.ts), looked at on 21 November 2026: Geelong's
  // waterfront at dusk for the hero, Melbourne's skyline over the Yarra in morning light for Explore.
  const hero = getSpineCity('geelong')
  const explore = getSpineCity('melbourne')
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: origin },
          { name: 'The Weekend Guide', url: `${origin}/weekend` },
        ]}
      />
      {/* The shared chrome (the PM's 15:03 of 21 November 2026: /weekend had neither, so at 1440 a visitor had no way off
          it). staticSafe: the page prerenders, so the header reads no session cookie (the city guide's own rule). */}
      <SiteHeader staticSafe />
      <WeekendGuide
        datesLabel={guide.datesLabel}
        featured={guide.featured}
        picks={guide.picks}
        hero={hero ? { src: hero.src, alt: "Geelong's waterfront pier at dusk, its lights reflected in the bay" } : null}
        explore={explore ? { src: explore.src, alt: "Melbourne's skyline over the Yarra and Princes Bridge in morning light" } : null}
      />
      <SiteFooter />
    </>
  )
}
