/**
 * Schema.org WebSite + Organization JSON-LD, SITE WIDE.
 *
 * Two payloads in a single block:
 *
 *   1. WebSite with `potentialAction: SearchAction`. Google uses this
 *      to surface a sitelinks search box directly under our brand
 *      result so users can search EventLinqs from Google without
 *      clicking through.
 *
 *   2. Organization with full address, sameAs (social), foundingDate,
 *      logo. Google's organisation rich-results pipeline reads this
 *      to populate the brand panel for "EventLinqs" branded queries.
 *
 * MOVED OUT OF THE HOMEPAGE, 8 September 2026 (close-out C19.4, which requires
 * "Organization and WebSite site wide"). It rendered on `/` alone from Batch 9
 * until then, so every other page on the platform, including every event page
 * and every community page a search result actually lands on, carried no
 * publisher identity at all. It is rendered once by src/app/layout.tsx and must
 * not be rendered again by a page: two copies of an Organization node is the
 * ambiguity the markup exists to remove.
 */
import { BRAND_STRAPLINE } from '@/lib/brand/positioning'

interface Props {
  baseUrl: string
}

export function SiteSchemaJsonLd({ baseUrl }: Props) {
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'EventLinqs',
    url: baseUrl,
    description:
      'Every community. Every event. One platform. Discover live events from communities across Australia and beyond.',
    inLanguage: 'en-AU',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/events?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'EventLinqs',
    url: baseUrl,
    logo: `${baseUrl}/icon`,
    description:
      `${BRAND_STRAPLINE} Find your suppliers, sell your tickets, run your door and get paid. Founded in Australia, serving organisers and attendees in every community.`,
    foundingDate: '2026',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Geelong',
      addressRegion: 'VIC',
      addressCountry: 'AU',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'hello@eventlinqs.com',
      areaServed: 'AU',
      availableLanguage: 'en',
    },
    sameAs: [
      // Real social URLs surface when M9 marketing ships them; placeholders
      // omitted to avoid linking to nothing.
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  )
}
