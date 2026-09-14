import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { JsonLd } from '@/components/seo/json-ld'
import { EventSchemaJsonLd } from '@/components/features/events/event-schema-jsonld'
import { OrganiserSchemaJsonLd } from '@/components/features/organisers/organiser-schema-jsonld'
import { VenueSchemaJsonLd } from '@/components/features/venues/venue-schema-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { SiteSchemaJsonLd } from '@/components/seo/site-schema-jsonld'
import { sameAsProfiles } from '@/lib/brand/social-profiles'

/**
 * SEO1 ACCEPTANCE 3: "the emitted JSON parses as valid JSON and ... @context is
 * https://schema.org on every page type."
 *
 * WHY THIS IS A RENDER TEST AND NOT SIX PAYLOAD TESTS. The thing that reaches
 * Google is the TEXT INSIDE A SCRIPT ELEMENT, and every step between the object
 * and that text is a place it can break: JSON.stringify, the escaping, the
 * dangerouslySetInnerHTML handoff, and the one shared emitter they now all go
 * through. A payload test proves the object. This proves the bytes.
 *
 * It is also the regression test for the centralisation itself. Six components
 * were rewired to <JsonLd> in one pass; if one of them lost its script tag the
 * page would keep rendering, every other test would stay green, and the pages
 * would simply stop being eligible for anything.
 */

const BASE = 'https://www.eventlinqs.com.au'

function blocksIn(container: HTMLElement): unknown[] {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]')
  return Array.from(scripts).map(s => JSON.parse(s.textContent ?? ''))
}

const EVENT = {
  id: 'evt_1',
  slug: 'lane-c-structured-data-night',
  title: 'Structured Data Night',
  status: 'published',
  timezone: 'Australia/Melbourne',
  summary: 'One night of machine readable markup.',
  description: null,
  cover_image_url: 'https://cdn.example.com/cover.avif',
  start_date: '2026-10-10T01:00:00+00:00',
  end_date: '2026-10-10T03:30:00+00:00',
  created_at: '2026-07-01T09:00:00+00:00',
  event_type: 'in_person',
  venue_name: 'Quakers Centre',
  venue_address: '484 William Street',
  venue_city: 'West Melbourne',
  venue_state: 'VIC',
  venue_postal_code: '3003',
  venue_country: 'Australia',
  venue_latitude: -37.8060772,
  venue_longitude: 144.9541452,
  category: { slug: 'music', name: 'Music' },
}

const ORGANISATION = {
  name: 'Lane C Presents',
  slug: 'lane-c-presents',
  description: null,
  logo_url: null,
  website: null,
}

const VENUE = {
  handle: 'quakers-centre',
  name: 'Quakers Centre',
  description: null,
  imageUrl: null,
  capacity: 220,
  city: 'West Melbourne',
  state: 'VIC',
  country: 'AU',
  address: '484 William Street',
  postalCode: '3003',
  latitude: -37.8060772,
  longitude: 144.9541452,
  venueType: 'Music',
}

const CASES: { page: string; type: string; node: React.ReactElement }[] = [
  {
    page: 'event detail',
    type: 'MusicEvent',
    node: (
      <EventSchemaJsonLd
        event={EVENT as never}
        organisation={ORGANISATION}
        ticketTiers={[{ id: 't1', name: 'General', price: 1800, currency: 'AUD' } as never]}
        state="upcoming"
        baseUrl={BASE}
      />
    ),
  },
  {
    page: 'organiser profile',
    type: 'Organization',
    node: <OrganiserSchemaJsonLd organisation={ORGANISATION} upcomingEvents={[]} baseUrl={BASE} />,
  },
  {
    page: 'venue profile',
    type: 'Place',
    node: <VenueSchemaJsonLd venue={VENUE as never} upcomingEvents={[]} baseUrl={BASE} />,
  },
  {
    page: 'any hierarchical page',
    type: 'BreadcrumbList',
    node: (
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: BASE },
          { name: 'Events', url: `${BASE}/events` },
        ]}
      />
    ),
  },
  {
    page: 'events listing',
    type: 'CollectionPage',
    node: (
      <EventCollectionJsonLd
        url={`${BASE}/events`}
        name="Events in Australia"
        events={[{ slug: 'lane-c-structured-data-night', title: 'Structured Data Night' }]}
        baseUrl={BASE}
      />
    ),
  },
]

describe('every JSON-LD block the platform emits', () => {
  it.each(CASES)('$page emits parseable JSON with the schema.org context', ({ type, node }) => {
    const { container } = render(node)
    const blocks = blocksIn(container) as Record<string, unknown>[]
    expect(blocks).toHaveLength(1)
    expect(blocks[0]['@context']).toBe('https://schema.org')
    expect(blocks[0]['@type']).toBe(type)
  })

  it('the site wide block emits WebSite and Organization, both with the context', () => {
    // Two payloads from one component, rendered by layout.tsx on every page.
    const { container } = render(<SiteSchemaJsonLd baseUrl={BASE} />)
    const blocks = blocksIn(container) as Record<string, unknown>[]
    expect(blocks.map(b => b['@type'])).toEqual(['WebSite', 'Organization'])
    expect(blocks.every(b => b['@context'] === 'https://schema.org')).toBe(true)
  })

  it.each([
    {
      page: 'organiser profile',
      profileType: 'Organization',
      node: (events: { slug: string; title: string }[]) => (
        <OrganiserSchemaJsonLd organisation={ORGANISATION} upcomingEvents={events} baseUrl={BASE} />
      ),
    },
    {
      page: 'venue profile',
      profileType: 'Place',
      node: (events: { slug: string; title: string }[]) => (
        <VenueSchemaJsonLd venue={VENUE as never} upcomingEvents={events} baseUrl={BASE} />
      ),
    },
  ])(
    'the $page lists its events as an ItemList and emits no Event node of its own',
    ({ profileType, node }) => {
      /*
       * SEO1 v2, FAULT THREE. Both of these components shipped
       * `event: [ { "@type": "Event", ... } x12 ]` nested inside their own
       * payload. Google: "Each event MUST have a unique URL (a leaf page) and
       * markup on that URL. The event experience on Google only supports pages
       * that focus on a single event."
       *
       * RENDERED rather than unit-tested on the builder, because the defect was
       * in what the COMPONENT chose to put in the page, and the builder it now
       * calls could be correct while the component still nested its own nodes.
       */
      const { container } = render(
        node([
          { slug: 'lane-c-one', title: 'One' },
          { slug: 'lane-c-two', title: 'Two' },
        ]),
      )
      const blocks = blocksIn(container) as Record<string, unknown>[]

      expect(blocks.map(b => b['@type'])).toEqual([profileType, 'ItemList'])
      expect(container.innerHTML).not.toMatch(/"@type":"\w*Event"/)
      // The profile payload must not carry the old property under any type.
      expect('event' in blocks[0]).toBe(false)

      const items = blocks[1].itemListElement as Record<string, unknown>[]
      expect(items.map(i => i.url)).toEqual([
        `${BASE}/events/lane-c-one`,
        `${BASE}/events/lane-c-two`,
      ])
    },
  )

  it.each([
    {
      page: 'organiser profile',
      node: <OrganiserSchemaJsonLd organisation={ORGANISATION} upcomingEvents={[]} baseUrl={BASE} />,
    },
    {
      page: 'venue profile',
      node: <VenueSchemaJsonLd venue={VENUE as never} upcomingEvents={[]} baseUrl={BASE} />,
    },
  ])('the $page with no upcoming events emits no empty ItemList', ({ node }) => {
    // 488 of 550 published URLs once emitted `itemListElement: []` with
    // `numberOfItems: 0`: markup saying "here is a list" and listing none.
    const { container } = render(node)
    const blocks = blocksIn(container) as Record<string, unknown>[]
    expect(blocks).toHaveLength(1)
  })

  it('the Organization block omits sameAs rather than emitting an empty array', () => {
    /*
     * `sameAs: []` shipped on every page of the platform: an array asserting
     * that EventLinqs is also nothing at all. The set now comes from
     * src/lib/brand/social-profiles.ts, which only asserts a profile it can show
     * exists, and the property is omitted when that set is empty.
     */
    const { container } = render(<SiteSchemaJsonLd baseUrl={BASE} />)
    const org = (blocksIn(container) as Record<string, unknown>[])[1]
    expect(org.sameAs).toEqual(sameAsProfiles())
    expect((org.sameAs as string[]).length).toBeGreaterThan(0)
    expect((org.sameAs as string[]).every(u => /^https:\/\//.test(u))).toBe(true)
  })
})

describe('the reversal condition, exercised rather than asserted', () => {
  /*
   * SEO1 v2's REVERSAL CONDITION, in the owner's words: "One flag,
   * structured_data_enabled, stops every block on every page type."
   *
   * A reversal nobody has ever performed is a claim. This performs it: the flag
   * module is replaced with `false`, the module graph is rebuilt, and a REAL
   * emitter is rendered through the real chain. `SiteSchemaJsonLd` is the one
   * chosen because it is rendered by the root layout on EVERY page, so if the
   * flag reaches it, it reaches everything.
   *
   * The other half of the promise is held by
   * scripts/guards/event-structured-data.mjs clause 2: no raw
   * application/ld+json tag exists in src outside <JsonLd>. Without that clause,
   * this test would prove the flag works and a seventeenth hand-rolled copy
   * would keep emitting anyway.
   */
  it('flipping STRUCTURED_DATA_ENABLED to false removes every block from a real emitter', async () => {
    vi.resetModules()
    vi.doMock('@/lib/seo/structured-data', () => ({ STRUCTURED_DATA_ENABLED: false }))
    try {
      const { SiteSchemaJsonLd: Off } = await import('@/components/seo/site-schema-jsonld')
      const { container } = render(<Off baseUrl={BASE} />)
      expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0)
    } finally {
      vi.doUnmock('@/lib/seo/structured-data')
      vi.resetModules()
    }
  })

  it('negative control: the same emitter emits two blocks with the flag as it ships', () => {
    // Without this, the test above would pass just as well against an emitter
    // that had quietly stopped emitting for some other reason.
    const { container } = render(<SiteSchemaJsonLd baseUrl={BASE} />)
    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(2)
  })

  it('leaves every other tag untouched, because nothing else can see the flag', () => {
    /*
     * The reversal promises "leaving every other tag untouched", and that is
     * true by construction rather than by luck: the flag is read in exactly one
     * place, <JsonLd>, which is the only thing in src that renders a script
     * element. Nothing in the metadata path can see it, so there is no route by
     * which flipping it could reach a canonical, a title or an Open Graph tag.
     *
     * Asserted by reading the two files rather than by trusting the sentence
     * above: the flag module DECLARES it, the emitter READS it, and a third
     * reader appearing is exactly the change that would make the promise false.
     */
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
    expect(read('src/lib/seo/structured-data.ts')).toContain(
      'export const STRUCTURED_DATA_ENABLED',
    )
    expect(read('src/components/seo/json-ld.tsx')).toContain('if (!STRUCTURED_DATA_ENABLED) return null')

    // The metadata half of the event page, which the reversal must not touch,
    // neither imports the flag nor could reach it.
    const eventPage = read('src/app/events/[slug]/page.tsx')
    expect(eventPage).toContain('alternates')
    expect(eventPage).not.toContain('STRUCTURED_DATA_ENABLED')
  })
})

describe('the one emitter', () => {
  it('emits nothing at all for a null payload, so a serialiser can simply decline', () => {
    const { container } = render(<JsonLd payload={null} />)
    expect(container.querySelectorAll('script').length).toBe(0)
  })

  it('a draft event renders no script tag, through the same route', () => {
    // The builder returns null and <JsonLd> renders nothing: the page needs no
    // condition of its own, so there is no condition to forget.
    const { container } = render(
      <EventSchemaJsonLd
        event={{ ...EVENT, status: 'draft' } as never}
        organisation={ORGANISATION}
        ticketTiers={[{ id: 't1', name: 'General', price: 1800, currency: 'AUD' } as never]}
        state="upcoming"
        baseUrl={BASE}
      />,
    )
    expect(container.querySelectorAll('script').length).toBe(0)
  })

  it('a closing script tag inside the data cannot close the element early', () => {
    /*
     * An organiser can type anything into an event description. JSON.stringify
     * does NOT escape "</script>", so the sequence would close the element and
     * spill the rest of the payload into the page as visible text, taking the
     * markup with it. The escaped form parses back to the identical string.
     */
    const nasty = { '@context': 'https://schema.org', '@type': 'Event', name: 'A </script> night' }
    const { container } = render(<JsonLd payload={nasty} />)
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts).toHaveLength(1)
    const parsed = JSON.parse(scripts[0].textContent ?? '') as Record<string, unknown>
    expect(parsed.name).toBe('A </script> night')
    expect(scripts[0].textContent).not.toContain('</script')
  })

  /*
   * THE PUSH GATE STOPPED HERE ON 14 SEPTEMBER 2026, with one line:
   *
   *     [structured-data] FAIL: /events/lineup-loop-proof-night-3z7osn
   *                       Offer.name is an empty string
   *
   * A ticket tier on TEST carries name = '' and the serialiser wrote it straight
   * into a nested Offer. The serialiser DID compact, over its own top level
   * only, so every nested Offer, Place, PostalAddress and PerformingGroup was
   * outside the clean it reported. These four are the regression, and they are
   * written against the BYTES for the same reason the rest of this file is: the
   * object is not what Google reads.
   */
  it('a nameless ticket tier omits Offer.name rather than publishing an empty one', () => {
    const { container } = render(
      <EventSchemaJsonLd
        event={EVENT as never}
        organisation={ORGANISATION}
        ticketTiers={[{ id: 't1', name: '', price: 2500, currency: 'AUD' } as never]}
        state="upcoming"
        baseUrl={BASE}
      />,
    )
    const [block] = blocksIn(container) as Record<string, unknown>[]
    const offers = block.offers as Record<string, unknown>[]
    expect(offers).toHaveLength(1)
    expect('name' in offers[0]).toBe(false)
    // The properties Google actually asks for are untouched by the pruning.
    expect(offers[0].price).toBe('25.00')
    expect(offers[0].priceCurrency).toBe('AUD')
    expect(offers[0].availability).toBe('https://schema.org/InStock')
  })

  it('a tier whose name is only whitespace is treated the same way', () => {
    const { container } = render(
      <EventSchemaJsonLd
        event={EVENT as never}
        organisation={ORGANISATION}
        ticketTiers={[{ id: 't1', name: '   ', price: 2500, currency: 'AUD' } as never]}
        state="upcoming"
        baseUrl={BASE}
      />,
    )
    const [block] = blocksIn(container) as Record<string, unknown>[]
    expect('name' in (block.offers as Record<string, unknown>[])[0]).toBe(false)
  })

  it('a named tier still carries its name, so the pruning is not just deletion', () => {
    const { container } = render(
      <EventSchemaJsonLd
        event={EVENT as never}
        organisation={ORGANISATION}
        ticketTiers={[{ id: 't1', name: 'General Admission', price: 2500, currency: 'AUD' } as never]}
        state="upcoming"
        baseUrl={BASE}
      />,
    )
    const [block] = blocksIn(container) as Record<string, unknown>[]
    expect((block.offers as Record<string, unknown>[])[0].name).toBe('General Admission')
  })

  it('the renderer itself prunes, so a serialiser that never compacts cannot emit an empty claim', () => {
    /*
     * <JsonLd> is the only point every page type must pass through, so the
     * invariant is pinned THERE and not only in the one serialiser that happened
     * to break it. Zero and false survive: a free ticket costs 0 and that is a
     * fact, not a blank.
     */
    const raw = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Proof Night',
      description: '',
      image: null,
      isAccessibleForFree: false,
      location: {
        '@type': 'Place',
        name: '',
        address: { '@type': 'PostalAddress', streetAddress: '  ', addressLocality: 'Geelong' },
      },
      offers: [{ '@type': 'Offer', name: '', price: '0.00', priceCurrency: 'AUD' }],
    }
    const { container } = render(<JsonLd payload={raw} />)
    const parsed = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
    ) as Record<string, unknown>

    expect('description' in parsed).toBe(false)
    expect('image' in parsed).toBe(false)
    expect(parsed.isAccessibleForFree).toBe(false)

    const place = parsed.location as Record<string, unknown>
    expect('name' in place).toBe(false)
    const address = place.address as Record<string, unknown>
    expect('streetAddress' in address).toBe(false)
    expect(address.addressLocality).toBe('Geelong')

    const offer = (parsed.offers as Record<string, unknown>[])[0]
    expect('name' in offer).toBe(false)
    expect(offer.price).toBe('0.00')
  })
})
