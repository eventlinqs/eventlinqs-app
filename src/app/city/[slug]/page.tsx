import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { loadDiscoveryRows, countCity } from '@/lib/seo/discovery-counts'
import { discoveryIndexingFor } from '@/lib/seo/discovery-threshold'
import { getCity, getAllCities, isCitySlug } from '@/lib/cities/data'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { getSiteUrl } from '@/lib/site-url'
import { JsonLd } from '@/components/seo/json-ld'
import { CityGuideScreen } from '@/components/features/city-guide/city-guide-screen'
import { getCityHeroPhoto } from '@/lib/images/city-photo'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllCities().map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = getCity(slug)
  if (!city) return { title: 'Not Found | EventLinqs' }

  const title = `What's on in ${city.name} | EventLinqs`
  const description = city.editorial.slice(0, 155)
  // INDEXABLE ONLY WHILE IT HOLDS EVENTS (close-out C19.3). The canonical is
  // self-referencing in both states; only the robots directive moves.
  const eventCount = countCity(await loadDiscoveryRows(), city.name)
  return {
    title,
    description,
    keywords: city.keywords,
    ...(await discoveryIndexingFor(eventCount, `/city/${city.slug}`)),
    openGraph: { title, description, url: `/city/${city.slug}`, type: 'website', images: ['/opengraph-image'] },
  }
}

/**
 * THE CITY GUIDE (the city-first directive of 1 November 2026): every city page is the same guide, for its own city
 * (src/components/features/city-guide). The City markup and the breadcrumb stay; the event list markup is the guide's.
 */
export default async function CityPage({ params }: Props) {
  const { slug } = await params
  if (!isCitySlug(slug)) notFound()
  const city = getCity(slug)!

  const baseUrl = getSiteUrl()
  const cityLd = {
    '@context': 'https://schema.org',
    '@type': 'City',
    name: city.name,
    containedInPlace: { '@type': 'Country', name: 'Australia' },
    url: `${baseUrl}/city/${city.slug}`,
    geo: { '@type': 'GeoCoordinates', latitude: city.latitude, longitude: city.longitude },
  }

  return (
    <>
      <JsonLd payload={cityLd} />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Cities', url: `${baseUrl}/cities` },
          { name: city.name, url: `${baseUrl}/city/${city.slug}` },
        ]}
      />
      <CityGuideScreen citySlug={city.slug} heroImage={await getCityHeroPhoto(city.slug)} />
    </>
  )
}
