import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { getSiteUrl } from '@/lib/site-url'
import { CityGuideScreen } from '@/components/features/city-guide/city-guide-screen'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { getCity } from '@/lib/cities/data'
import { STATE_PAGES, statePageOf } from '@/lib/cities/state-pages'

export const revalidate = 300

interface Props {
  params: Promise<{ state: string }>
}

export function generateStaticParams() {
  return STATE_PAGES.filter((s) => getCity(s.anchor) !== null).map((s) => ({ state: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = statePageOf((await params).state)
  if (!s || !getCity(s.anchor)) return { title: 'Not Found | EventLinqs' }
  const title = `What's on in ${s.name} | EventLinqs`
  const description = `Every event in ${s.name}'s cities on EventLinqs: live music, festivals, markets, family days and more, one place.`
  // Not indexed (src/lib/seo/indexing-policy.ts): each city guide is the indexable page; this is their state view.
  return { title, description, robots: { index: false, follow: true }, alternates: { canonical: `/state/${s.slug}` }, openGraph: { title, description, url: `/state/${s.slug}`, type: 'website', images: ['/opengraph-image'] } }
}

/**
 * THE STATE PAGE (the CONTROLLER's 14:10 of 3 November 2026): the city guide for every listed city of one state, opened
 * by the state chip on any of its city guides. One component, the guide's own, in its state scope.
 */
export default async function StatePage({ params }: Props) {
  const s = statePageOf((await params).state)
  if (!s) notFound()
  const anchor = getCity(s.anchor)
  if (!anchor) notFound()
  const baseUrl = getSiteUrl()
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Cities', url: `${baseUrl}/cities` },
          { name: s.name, url: `${baseUrl}/state/${s.slug}` },
        ]}
      />
      <CityGuideScreen citySlug={anchor.slug} heroImage={await getCityHeroPhoto(anchor.slug)} scope="state" />
    </>
  )
}
