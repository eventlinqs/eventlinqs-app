/**
 * Schema.org WebSite + Organization JSON-LD for the homepage (Batch 9).
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
 * Per the Batch 9 V2 brief this is the SEO launch blocker for the
 * homepage.
 */

interface Props {
  baseUrl: string
}

export function HomeSchemaJsonLd({ baseUrl }: Props) {
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
      'Live event ticketing platform built for every community. Founded in Australia, serving organisers and attendees across 20 cities and 14 community heritages.',
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
