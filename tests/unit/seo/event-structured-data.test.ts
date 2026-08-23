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
import { validateEventNode } from '../../../scripts/verify/event-structured-data-audit.mjs'

type Validation = { errors: string[]; warnings: string[] }
const validate = (node: unknown): Validation => validateEventNode(node) as Validation

const BASE = 'https://www.eventlinqs.com.au'

/** A realistic published event, shaped like a row the event page renders. */
function anEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    slug: 'amapiano-all-night-melbourne-2026',
    title: 'Amapiano All Night',
    summary: 'A full night of amapiano at one of Melbourne’s best rooms.',
    description: '<p>Doors at 9pm.</p>',
    cover_image_url: 'https://cdn.example.com/cover.avif',
    start_date: '2026-09-12T21:00:00+10:00',
    end_date: '2026-09-13T03:00:00+10:00',
    created_at: '2026-07-01T09:00:00+10:00',
    event_type: 'physical',
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

  it('carries offers.validFrom on a MULTI-TIER event', () => {
    // The aggregate-offer branch dropped validFrom, so it was missing on 26 of
    // 36 production pages, and every one of those was multi-tier.
    const offers = (build() as Record<string, unknown>).offers as Record<string, unknown>
    expect(offers['@type']).toBe('AggregateOffer')
    expect(offers.validFrom).toBe('2026-07-01T09:00:00+10:00')
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
  it('startDate keeps its UTC offset, so Google does not have to guess a timezone', () => {
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
