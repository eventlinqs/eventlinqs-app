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
import { contactAddress } from '@/lib/email/sender'
import { sameAsProfiles } from '@/lib/brand/social-profiles'
import { JsonLd } from '@/components/seo/json-ld'

interface Props {
  baseUrl: string
}

export function SiteSchemaJsonLd({ baseUrl }: Props) {
  const sameAs = sameAsProfiles()

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
      email: contactAddress('hello'),
      areaServed: 'AU',
      availableLanguage: 'en',
    },
    // OMITTED rather than emitted empty. `sameAs: []` shipped on every page of
    // the platform: an array asserting that EventLinqs is also nothing at all.
    // The set is read from src/lib/brand/social-profiles.ts, which is the one
    // list the footer and the contact page read too, and which carries the
    // proof for each URL it is prepared to assert.
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }

  return (
    <>
      <JsonLd payload={website} />
      <JsonLd payload={organization} />
    </>
  )
}
