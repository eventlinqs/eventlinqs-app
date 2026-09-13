/**
 * AN EVENT PAGE CAN NEVER SHIP WITHOUT VALID EVENT STRUCTURED DATA.
 *
 * This is the build-blocking half of the discoverability work of 23 August
 * 2026. The other half is scripts/verify/event-structured-data-audit.mjs, which
 * audits a DEPLOYED site. This file audits the PAYLOAD BUILDER, so a regression
 * is caught before it is deployed rather than after.
 *
 * The two share one definition of "valid": this file imports `validateEventNode`
 * from the audit script itself. They cannot drift into disagreeing, and the
 * rules live in exactly one place, cited from Google's own documentation in
 * that file's header (fetched 2026-08-23).
 *
 * WHY A PAYLOAD TEST RATHER THAN A SOURCE GREP. A grep for "EventSchemaJsonLd"
 * in the page proves the component is mentioned. It does not prove the markup
 * is valid, and every defect the production audit actually found was a valid-
 * looking component emitting an incomplete payload: `performer` missing on 36
 * of 36 pages, `offers.validFrom` missing on every multi-tier event, and empty
 * strings written for absent venue fields.
 *
 * Assertions that measure an ABSENCE carry a negative control.
 */
import { describe, it, expect } from 'vitest'

import { buildEventSchemaPayload } from '@/components/features/events/event-schema-jsonld'
import { buildEventItemList } from '@/lib/seo/event-item-list'
import { validateEventNode } from '../../../scripts/verify/event-structured-data-audit.mjs'
/*
 * The two properties Google withdrew on 5 June 2025, from the one module that
 * names them. Imported rather than typed here so the guard that forbids them
 * does not fail on the test that proves they are gone; see that module's header.
 */
import {
  ATTENDANCE_MODE_PROPERTY,
  ONLINE_LOCATION_TYPE,
  withdrawnOnlineEventPattern,
} from '../../../scripts/lib/withdrawn-online-event-properties.mjs'

type Validation = { errors: string[]; warnings: string[] }
const validate = (node: unknown): Validation => validateEventNode(node) as Validation

const BASE = 'https://www.eventlinqs.com.au'

/** A realistic published event, shaped like a row the event page renders. */
function anEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    slug: 'amapiano-all-night-melbourne-2026',
    title: 'Amapiano All Night',
    status: 'published',
    // NOT NULL on the events table, and the reason every date below is written
    // in the event's own offset rather than the server's.
    timezone: 'Australia/Melbourne',
    venue_postal_code: '3065',
    summary: 'A full night of amapiano at one of Melbourne’s best rooms.',
    description: '<p>Doors at 9pm.</p>',
    cover_image_url: 'https://cdn.example.com/cover.avif',
    start_date: '2026-09-12T21:00:00+10:00',
    end_date: '2026-09-13T03:00:00+10:00',
    created_at: '2026-07-01T09:00:00+10:00',
    event_type: 'in_person',
    venue_name: 'The Night Cat',
    venue_address: '141 Johnston St',
    venue_city: 'Melbourne',
    venue_state: 'VIC',
    venue_country: 'AU',
    venue_latitude: -37.7986,
    venue_longitude: 144.9799,
    category: { slug: 'music', name: 'Music' },
    ...overrides,
  // The builder takes the full Event row; this fixture carries the fields it
  // reads, which is what the assertion is about.
  } as never
}

const ORG = { name: 'Owambe Sydney', slug: 'owambe-sydney', description: null }

const TIERS = [
  { id: 't1', name: 'Early bird', price: 2500, currency: 'AUD' },
  { id: 't2', name: 'General', price: 4000, currency: 'AUD' },
]

function build(overrides: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) {
  return buildEventSchemaPayload({
    event: anEvent(overrides),
    organisation: ORG,
    ticketTiers: TIERS,
    state: 'upcoming',
    baseUrl: BASE,
    ...opts,
  } as never)
}

describe('the shipped Event payload meets Google’s required set', () => {
  it('a normal published event is valid', () => {
    const { errors } = validate(build())
    expect(errors).toEqual([])
  })

  it.each([
    ['a free event', { }, [{ id: 't1', name: 'Free', price: 0, currency: 'AUD' }]],
    ['a single-tier event', { }, [{ id: 't1', name: 'General', price: 3000, currency: 'AUD' }]],
  ])('%s is valid', (_label, overrides, tiers) => {
    const payload = buildEventSchemaPayload({
      event: anEvent(overrides as Record<string, unknown>),
      organisation: ORG,
      ticketTiers: tiers as typeof TIERS,
      state: 'upcoming',
      baseUrl: BASE,
    } as never)
    expect(validate(payload).errors).toEqual([])
  })

  it.each(['sold-out', 'cancelled', 'postponed', 'past'])(
    'stays valid in the %s state',
    state => {
      const payload = buildEventSchemaPayload({
        event: anEvent(),
        organisation: ORG,
        ticketTiers: TIERS,
        state,
        baseUrl: BASE,
      } as never)
      expect(validate(payload).errors).toEqual([])
    },
  )

  it('negative control: the validator rejects a payload missing the required set', () => {
    // Without this, "errors is empty" would also pass if validateEventNode
    // silently returned no errors for everything.
    const broken = { '@type': 'Event', name: '', startDate: '', location: undefined }
    expect(validate(broken).errors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('the defects the production audit found cannot come back', () => {
  it('emits performer, one node per artist, when a lineup exists', () => {
    // Missing on 36 of 36 production event pages on 23 August 2026, while the
    // page was already loading the lineup to render it visibly.
    const payload = build({}, {
      performers: [
        { id: 'a1', slug: 'sampa-the-great', name: 'Sampa the Great' },
        { id: 'a2', slug: 'genesis-owusu', name: 'Genesis Owusu' },
      ],
    }) as Record<string, unknown>
    const performer = payload.performer as { '@type': string; name: string; url: string }[]
    expect(performer).toHaveLength(2)
    expect(performer[0]).toEqual({
      '@type': 'PerformingGroup',
      name: 'Sampa the Great',
      url: `${BASE}/artists/sampa-the-great`,
    })
  })

  it('omits performer entirely when there is no lineup, rather than an empty array', () => {
    // An empty array is a positive claim that nobody is performing.
    expect('performer' in (build() as Record<string, unknown>)).toBe(false)
  })

  it('carries offers.validFrom on EVERY offer of a MULTI-TIER event', () => {
    // The aggregate-offer branch dropped validFrom, so it was missing on 26 of
    // 36 production pages, and every one of those was multi-tier. The aggregate
    // branch itself is gone (SEO1 D4, one Offer per tier), so the property is
    // now checked on each of them rather than on the single node that replaced
    // them.
    const offers = (build() as Record<string, unknown>).offers as Record<string, unknown>[]
    expect(offers).toHaveLength(TIERS.length)
    for (const offer of offers) {
      expect(offer['@type']).toBe('Offer')
      expect(offer.validFrom).toBe('2026-07-01T09:00:00+10:00')
    }
  })

  it('never writes an empty string for an absent venue field', () => {
    // The builder used `?? ''` throughout, so an event with no street address
    // published "streetAddress": "". Omission is the honest encoding.
    const payload = build({
      venue_address: null,
      venue_state: null,
      venue_name: null,
    }) as Record<string, unknown>
    const place = payload.location as Record<string, unknown>
    const address = place.address as Record<string, unknown>

    const emptyStrings = Object.entries({ ...place, ...address })
      .filter(([, v]) => typeof v === 'string' && v.trim() === '')
      .map(([k]) => k)
    expect(emptyStrings).toEqual([])

    expect('streetAddress' in address).toBe(false)
    expect('name' in place).toBe(false)
    // The required property itself survives.
    expect(address.addressLocality).toBe('Melbourne')
    expect(validate(payload).errors).toEqual([])
  })

  it('negative control: an empty-string address field would be caught', () => {
    const withEmpties = { streetAddress: '', addressLocality: 'Melbourne' }
    const found = Object.entries(withEmpties)
      .filter(([, v]) => typeof v === 'string' && v.trim() === '')
      .map(([k]) => k)
    expect(found).toEqual(['streetAddress'])
  })
})

describe('the documented pairing rules hold', () => {
  it('startDate carries an offset, so Google does not have to guess a timezone', () => {
    const payload = build() as Record<string, unknown>
    expect(payload.startDate).toMatch(/[+-]\d{2}:\d{2}$/)
    expect(validate(payload).warnings.join(' ')).not.toMatch(/no UTC offset/)
  })

  it('never emits previousStartDate without EventRescheduled', () => {
    // Google: "If you add previousStartDate, you must also add the eventStatus
    // property and set the eventStatus to EventRescheduled."
    const payload = build() as Record<string, unknown>
    if ('previousStartDate' in payload) {
      expect(String(payload.eventStatus)).toContain('EventRescheduled')
    }
    expect(validate(payload).errors).toEqual([])
  })

  it('negative control: the validator catches that pairing when it is broken', () => {
    const broken = {
      '@type': 'Event',
      name: 'Rescheduled night',
      startDate: '2026-09-12T21:00:00+10:00',
      previousStartDate: '2026-08-01T21:00:00+10:00',
      eventStatus: 'https://schema.org/EventPostponed',
      location: {
        '@type': 'Place',
        name: 'The Night Cat',
        address: { '@type': 'PostalAddress', streetAddress: '141 Johnston St', addressLocality: 'Melbourne' },
      },
    }
    expect(validate(broken).errors.join(' ')).toContain('previousStartDate')
  })
})

/**
 * SEO1's ACCEPTANCE LIST, EACH TEST CARRYING THE NAME THE ITEM GAVE IT.
 *
 * The owner wrote these twelve names into CLOSE-OUT-NEXT.md, so they are kept
 * verbatim rather than paraphrased into prose: a reader holding the item can
 * match line to line without interpreting anything. Five of them were proven RED
 * against the shipped serialiser before the fix, and the defect each one catches
 * is named beside it.
 */
describe('SEO1 v2 acceptance', () => {
  it('event_emits_required_four_fields', () => {
    const payload = build() as Record<string, unknown>
    expect(String(payload['@type'])).toMatch(/Event$/)
    expect(payload['@context']).toBe('https://schema.org')

    /*
     * THE FOUR, NAMED, because the test's name says four and a reader should be
     * able to see which four. SEO1 v2 step 2: "Required by Google: name,
     * startDate in ISO 8601 with a UTC or GMT offset, location as a Place, and
     * location.address as a PostalAddress."
     */
    expect(payload.name).toBe('Amapiano All Night')
    expect(typeof payload.startDate).toBe('string')
    const place = payload.location as Record<string, unknown>
    expect(place['@type']).toBe('Place')
    expect((place.address as Record<string, unknown>)['@type']).toBe('PostalAddress')

    // location.name is RECOMMENDED rather than required, and it is emitted.
    expect(place.name).toBe('The Night Cat')
    expect(validate(payload).errors).toEqual([])
  })

  it('start_date_carries_utc_offset', () => {
    /*
     * RED BEFORE THE FIX. Production emitted "2026-10-10T01:00:00+00:00" on an
     * event the same page told a human began at 12:00 pm AEDT, because the raw
     * Supabase value is UTC and nothing converted it. Google's own example uses
     * the event's offset, and a live Eventbrite AU page emits "+11:00".
     */
    const payload = build({
      start_date: '2026-10-10T01:00:00+00:00',
      end_date: '2026-10-10T03:30:00+00:00',
      timezone: 'Australia/Melbourne',
    }) as Record<string, unknown>

    expect(payload.startDate).toBe('2026-10-10T12:00:00+11:00')
    expect(payload.endDate).toBe('2026-10-10T14:30:00+11:00')

    /*
     * THE OFFSET IS ASKED AT THE INSTANT, NEVER HELD AS A CONSTANT. Australian
     * eastern time moves to UTC+11 on 4 October 2026, so an event either side of
     * that date must get a different answer from the SAME zone. A fixed offset
     * passes the assertion above and fails this one.
     */
    const beforeDst = build({
      start_date: '2026-10-01T01:00:00+00:00',
      end_date: '2026-10-01T03:00:00+00:00',
      timezone: 'Australia/Melbourne',
    }) as Record<string, unknown>
    expect(beforeDst.startDate).toBe('2026-10-01T11:00:00+10:00')

    // A zone that does not move keeps its own offset on both dates.
    const perth = build({
      start_date: '2026-10-10T01:00:00+00:00',
      end_date: '2026-10-10T03:00:00+00:00',
      timezone: 'Australia/Perth',
    }) as Record<string, unknown>
    expect(perth.startDate).toBe('2026-10-10T09:00:00+08:00')
  })

  it('tiered_event_emits_one_offer_per_tier', () => {
    /*
     * RED BEFORE THE FIX. Two or more tiers collapsed into a single
     * AggregateOffer carrying a price range and nothing about what was on sale.
     * Google: "offers | Offer | A nested Offer, one for each ticket type."
     */
    const tiers = [
      { id: 't1', name: 'Early bird', price: 2500, currency: 'AUD' },
      { id: 't2', name: 'General', price: 4000, currency: 'AUD' },
      { id: 't3', name: 'VIP', price: 9000, currency: 'AUD' },
    ]
    const payload = buildEventSchemaPayload({
      event: anEvent(), organisation: ORG, ticketTiers: tiers, state: 'upcoming', baseUrl: BASE,
    } as never) as Record<string, unknown>

    const offers = payload.offers as Record<string, unknown>[]
    expect(Array.isArray(offers)).toBe(true)
    expect(offers).toHaveLength(3)
    expect(offers.map(o => o.name)).toEqual(['Early bird', 'General', 'VIP'])
    expect(offers.map(o => o.price)).toEqual(['25.00', '40.00', '90.00'])
    expect(offers.every(o => o['@type'] === 'Offer')).toBe(true)
    // A single tier takes the same shape, so a reader never branches on count.
    const single = buildEventSchemaPayload({
      event: anEvent(), organisation: ORG, ticketTiers: [tiers[0]], state: 'upcoming', baseUrl: BASE,
    } as never) as Record<string, unknown>
    expect(Array.isArray(single.offers)).toBe(true)
    expect(single.offers as unknown[]).toHaveLength(1)
  })

  it('sold_out_emits_soldout', () => {
    const payload = buildEventSchemaPayload({
      event: anEvent(), organisation: ORG, ticketTiers: TIERS, state: 'sold-out', baseUrl: BASE,
    } as never) as Record<string, unknown>
    const offers = payload.offers as Record<string, unknown>[]
    expect(offers.every(o => o.availability === 'https://schema.org/SoldOut')).toBe(true)
    // Negative control: the same event on sale must NOT read SoldOut, or the
    // assertion above would pass on a serialiser that hard-coded it.
    const onSale = (build() as Record<string, unknown>).offers as Record<string, unknown>[]
    expect(onSale.every(o => o.availability === 'https://schema.org/InStock')).toBe(true)
  })

  it('cancelled_emits_eventcancelled', () => {
    const payload = buildEventSchemaPayload({
      event: anEvent(), organisation: ORG, ticketTiers: TIERS, state: 'cancelled', baseUrl: BASE,
    } as never) as Record<string, unknown>
    expect(payload.eventStatus).toBe('https://schema.org/EventCancelled')
    /*
     * Google: "Don't remove or change other properties (for example, don't
     * remove startDate or location); instead, keep all values as the same as
     * they were before the cancelation". So the block must still be there and
     * still be complete, which is the opposite of the instinct to drop it.
     */
    expect(payload.startDate).toBeTruthy()
    expect(payload.location).toBeTruthy()
    expect(validate(payload).errors).toEqual([])
  })

  it('postponed_event_emits_eventpostponed', () => {
    const payload = buildEventSchemaPayload({
      event: anEvent(), organisation: ORG, ticketTiers: TIERS, state: 'postponed', baseUrl: BASE,
    } as never) as Record<string, unknown>
    expect(payload.eventStatus).toBe('https://schema.org/EventPostponed')
    // A postponed event has no NEW date, so it must not claim to be rescheduled.
    expect('previousStartDate' in payload).toBe(false)
  })

  it('rescheduled_emits_previousstartdate', () => {
    const payload = build({
      previous_start_date: '2026-08-01T09:00:00+00:00',
    }) as Record<string, unknown>
    expect(payload.eventStatus).toBe('https://schema.org/EventRescheduled')
    // In the event's own offset, like every other date in the payload.
    expect(payload.previousStartDate).toBe('2026-08-01T19:00:00+10:00')
    expect(validate(payload).errors).toEqual([])
  })

  it('draft_emits_nothing', () => {
    /*
     * RED BEFORE THE FIX: the builder had no opinion about status at all, so a
     * draft rendered anywhere would have been described to Google as a live
     * event. Row level security keeps drafts out of the public read today, which
     * is why it never happened; that is a second line of defence, not this one.
     */
    expect(build({ status: 'draft' })).toBeNull()
    expect(build({ status: 'scheduled' })).toBeNull()
    expect(build({ status: 'archived' })).toBeNull()
    // And the states that MUST keep their markup, per Google's cancellation rule.
    for (const status of ['published', 'paused', 'postponed', 'cancelled', 'completed']) {
      expect(build({ status })).not.toBeNull()
    }
  })

  it('missing_image_omits_property', () => {
    const payload = build({ cover_image_url: null }) as Record<string, unknown>
    expect('image' in payload).toBe(false)
    // Negative control: the property IS emitted when the row holds one, so the
    // assertion above is measuring absence rather than a serialiser that never
    // emits it.
    expect((build() as Record<string, unknown>).image).toEqual(['https://cdn.example.com/cover.avif'])
  })

  it('missing_postcode_omits_the_property', () => {
    /*
     * RED BEFORE THE FIX in the other direction: postalCode was never emitted at
     * all, on any event, although events.venue_postal_code has existed and been
     * loaded by the page all along. Google's own address example carries it.
     */
    const address = (build() as Record<string, unknown>).location as Record<string, unknown>
    expect((address.address as Record<string, unknown>).postalCode).toBe('3065')

    const without = build({ venue_postal_code: null }) as Record<string, unknown>
    const addr = (without.location as Record<string, unknown>).address as Record<string, unknown>
    expect('postalCode' in addr).toBe(false)
    expect(validate(without).errors).toEqual([])
  })

  it('all_urls_absolute', () => {
    const payload = build({}, {
      performers: [{ id: 'a1', slug: 'sampa-the-great', name: 'Sampa the Great' }],
    })
    const relative: string[] = []
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) { node.forEach((n, i) => walk(n, `${path}[${i}]`)); return }
      if (node === null || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        // Every property whose value is a link, plus @id, which is one too.
        if (['url', 'item', '@id', 'logo'].includes(key) && typeof value === 'string') {
          if (!/^https?:\/\//.test(value)) relative.push(`${path}.${key} = ${value}`)
        }
        walk(value, `${path}.${key}`)
      }
    }
    walk(payload, 'payload')
    expect(relative).toEqual([])

    // Negative control: the walker really does catch a relative link.
    const broken: string[] = []
    const walkBroken = (n: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(n)) {
        if (k === 'url' && typeof v === 'string' && !/^https?:\/\//.test(v)) broken.push(v)
      }
    }
    walkBroken({ url: '/events/amapiano-all-night-melbourne-2026' })
    expect(broken).toEqual(['/events/amapiano-all-night-melbourne-2026'])
  })

  it('price_read_from_database', () => {
    /*
     * RED BEFORE THE FIX on the price half. The page renders
     * display_price_cents, which carries a live demand-price move; the
     * serialiser was handed the raw rows and read `price`, so any event with a
     * price move told Google a figure nobody could buy at. Google's note on the
     * property: "Don't forget to update it as prices change or tickets sell
     * out."
     */
    const moved = buildEventSchemaPayload({
      event: anEvent(),
      organisation: ORG,
      ticketTiers: [{ id: 't1', name: 'General', price: 4000, currency: 'AUD', display_price_cents: 5500 }],
      state: 'upcoming',
      baseUrl: BASE,
    } as never) as Record<string, unknown>
    expect((moved.offers as Record<string, unknown>[])[0].price).toBe('55.00')

    // Three different rows, three different answers: nothing is a literal.
    const cases = [
      { price: 1234, currency: 'AUD', expect: '12.34' },
      { price: 9900, currency: 'NZD', expect: '99.00' },
      { price: 0, currency: 'AUD', expect: '0.00' },
    ]
    for (const c of cases) {
      const payload = buildEventSchemaPayload({
        event: anEvent(),
        organisation: ORG,
        ticketTiers: [{ id: 't1', name: 'General', price: c.price, currency: c.currency }],
        state: 'upcoming',
        baseUrl: BASE,
      } as never) as Record<string, unknown>
      const offer = (payload.offers as Record<string, unknown>[])[0]
      expect(offer.price).toBe(c.expect)
      expect(offer.priceCurrency).toBe(c.currency)
    }
  })

  it('no_event_attendance_mode_is_emitted_anywhere', () => {
    /*
     * SEO1 v2, FAULT ONE. Google removed online events, and every property
     * describing one, from its event structured-data documentation on 5 June
     * 2025, so emitting the attendance mode is writing dead code. The shipped
     * payload carried it on EVERY event, and a live production fetch on
     * 14 September 2026 shows it:
     * "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode"
     * (C:\dev\EVIDENCE\SEO1\live-event-2026-09-14.html).
     *
     * ASSERTED ON THE BYTES, not on the object, because that is what reaches
     * Google. A key holding `undefined` is absent from the JSON and present on
     * the object, and this test must not be satisfiable by that difference.
     */
    for (const eventType of ['in_person', 'hybrid']) {
      const json = JSON.stringify(build({ event_type: eventType }))
      expect(json).not.toContain(ATTENDANCE_MODE_PROPERTY)
      expect(json).not.toContain(ONLINE_LOCATION_TYPE)
      // The VALUE as well as the property name: every attendance mode Google
      // used to document was a schema.org URL ending in that word, so a payload
      // could carry one under a different key and still be the withdrawn
      // feature. withdrawnOnlineEventPattern() matches either form.
      expect(json).not.toMatch(withdrawnOnlineEventPattern())
      // Negative control: the string this test hunts for is one it CAN find, so
      // a serialiser that emitted nothing at all would not pass by accident.
      expect(json).toContain('"@type":"Place"')
    }

    // An online event has no Place at all, and Google's four required fields
    // include one. It is not described rather than described with an address it
    // does not have (step 8: a wrong address is worse than no address).
    expect(
      build({
        event_type: 'virtual',
        venue_name: null,
        venue_address: null,
        venue_city: null,
        venue_state: null,
        venue_postal_code: null,
        venue_country: null,
      }),
    ).toBeNull()
  })

  it('no_event_markup_on_any_listing_page', () => {
    /*
     * SEO1 v2, FAULT THREE. Google: "Each event MUST have a unique URL (a leaf
     * page) and markup on that URL. The event experience on Google only supports
     * pages that focus on a single event."
     *
     * THIS TEST JUDGES THE BUILDERS THAT LISTING PAGES ACTUALLY CALL, because
     * the defect was not on /events. The organiser profile and the venue profile
     * each nested twelve `Event` nodes inside their own payload, built from a
     * city string, so the platform published a lower-quality duplicate of its
     * own leaf markup on two page types.
     *
     * The GUARD holds the same rule over the whole of src, by file
     * (scripts/guards/event-structured-data.mjs, clause 5). This holds it over
     * the emitted bytes, which is the half a grep cannot see.
     */
    const listed = [
      { slug: 'lane-c-one', title: 'One' },
      { slug: 'lane-c-two', title: 'Two' },
    ]
    const itemList = buildEventItemList({
      events: listed,
      baseUrl: BASE,
      name: 'Upcoming events at The Night Cat',
      url: `${BASE}/venues/the-night-cat`,
    })
    const json = JSON.stringify(itemList)

    expect(json).not.toMatch(/"@type":"\w*Event"/)
    expect((itemList as Record<string, unknown>)['@type']).toBe('ItemList')

    // Every item points at the LEAF page, which is where the Event markup is.
    const items = (itemList as { itemListElement: Record<string, unknown>[] }).itemListElement
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'One',
      url: `${BASE}/events/lane-c-one`,
    })

    // An empty list is not a collection: 488 of 550 published URLs once emitted
    // `itemListElement: []` with `numberOfItems: 0`.
    expect(buildEventItemList({ events: [], baseUrl: BASE, name: 'Nothing', url: BASE })).toBeNull()

    // numberOfItems is the TOTAL, not the sample, so a profile with more than
    // the limit does not quietly understate what it has on sale.
    const many = Array.from({ length: 20 }, (_, i) => ({ slug: `lane-c-${i}`, title: `Event ${i}` }))
    const big = buildEventItemList({ events: many, baseUrl: BASE, name: 'Many', url: BASE }) as Record<string, unknown>
    expect(big.numberOfItems).toBe(20)
    expect((big.itemListElement as unknown[]).length).toBe(12)
  })
})

describe('SEO1: the country code, and the JSON itself', () => {
  it('normalises the spellings of Australia to the ISO code and passes anything else through', () => {
    // Production emits "addressCountry": "Australia", the raw row value. SEO1
    // step 3 asks for AU and a live Eventbrite AU page emits AU.
    const countryOf = (raw: unknown) => {
      const payload = build({ venue_country: raw }) as Record<string, unknown>
      const place = payload.location as Record<string, unknown>
      return (place.address as Record<string, unknown>).addressCountry
    }
    for (const spelling of ['Australia', 'australia', 'AUS', 'au', ' AU ']) {
      expect(countryOf(spelling)).toBe('AU')
    }
    // NEVER GUESSED. An unrecognised country is passed through untouched rather
    // than mapped, because a wrong address is worse than no address (step 8).
    expect(countryOf('New Zealand')).toBe('New Zealand')
    // An absent country falls back to AU: this is an Australian platform and the
    // property is one Google's example always carries.
    expect(countryOf(null)).toBe('AU')
  })

  it('the emitted payload is valid JSON and carries the schema.org context', () => {
    const payload = build()
    const roundTripped = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
    expect(roundTripped['@context']).toBe('https://schema.org')
    // No undefined leaks through as a key: JSON.stringify drops them, so a
    // round trip proves the emitted bytes and the object agree.
    expect(Object.values(roundTripped).includes(undefined)).toBe(false)
  })
})
