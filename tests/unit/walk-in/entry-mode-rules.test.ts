/**
 * WI1, SLICE 1: THE RULES A FREE WALK-IN EVENT LIVES BY, IN THE CODE.
 *
 * The database half (a walk-in event holds no ticket type, is always free, keeps
 * its mode once out of draft) is proven on TEST by
 * scripts/verify/wi1-walk-in-db-proof.sql. This file proves the code half: the
 * sale decision refuses it with its own reason, the publish gate judges it on
 * its hours and never on Stripe, the guide parses only the shape the page was
 * drawn for, and the structured data describes it as free at price 0.
 */
import { describe, expect, it } from 'vitest'
import { isWalkIn, FREE_ENTRY_LABEL } from '@/lib/events/entry-mode'
import {
  ticketsOnSaleDetailed,
  describeSaleRefusal,
  saleRefusalMessage,
} from '@/lib/payments/sale-status'
import { checkSellable } from '@/lib/events/sellable-guard'
import { checkPublishGate } from '@/lib/events/publish-gate'
import {
  parseGuide,
  formatClock,
  dayHours,
  spanDates,
  walkInHoursProblems,
  type GuideDay,
} from '@/lib/walk-in/guide'
import { walkInFactsFromRow, embeddedGuideDays } from '@/lib/walk-in/publish-facts'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { HoursText } from '@/components/events/walk-in/hours-list'
import { buildEventSchemaPayload } from '@/components/features/events/event-schema-jsonld'
import { validateEventNode } from '../../../scripts/verify/event-structured-data-audit.mjs'

const FUTURE = (days: number) => new Date(Date.now() + days * 864e5).toISOString()

/** A guide day as the organiser fills it in. */
const day = (date: string, overrides: Partial<GuideDay> = {}): GuideDay => ({
  date,
  opens: '10:00',
  closes: '22:00',
  hours_label: null,
  items: [],
  closer: null,
  ...overrides,
})

describe('isWalkIn reads the mode and nothing else', () => {
  it('is true only for walk_in', () => {
    expect(isWalkIn({ entry_mode: 'walk_in' })).toBe(true)
    expect(isWalkIn({ entry_mode: 'tickets' })).toBe(false)
    expect(isWalkIn({ entry_mode: null })).toBe(false)
    expect(isWalkIn({})).toBe(false)
    expect(isWalkIn(null)).toBe(false)
    // A missing or unknown mode is NOT walk-in: a typo must never hide a checkout.
    expect(isWalkIn({ entry_mode: 'WALK_IN' })).toBe(false)
  })
})

describe('the sale decision refuses a walk-in event with its own reason', () => {
  it('refuses walk-in even when the event is "free" and the organiser could sell', () => {
    expect(
      ticketsOnSaleDetailed({ isPaidEvent: false, event: { entry_mode: 'walk_in' }, organiserSellable: true }),
    ).toEqual({ onSale: false, reason: 'walk_in' })
  })

  it('an external ticket link still wins first, as before', () => {
    expect(
      ticketsOnSaleDetailed({
        isPaidEvent: false,
        event: { entry_mode: 'walk_in', external_ticket_url: 'https://x.example/t' },
      }),
    ).toEqual({ onSale: false, reason: 'externally_ticketed' })
  })

  it('a ticketed free event is on sale exactly as before', () => {
    expect(ticketsOnSaleDetailed({ isPaidEvent: false, event: { entry_mode: 'tickets' } })).toEqual({
      onSale: true,
      reason: null,
    })
  })

  it('tells a buyer the truth and uses no ticket word but "No ticket needed"', () => {
    const buyer = describeSaleRefusal('walk_in', 'buyer')
    expect(buyer.heading).toBe('No ticket needed')
    expect(buyer.body).toBe('Entry is free. Just come along.')
    expect(buyer.action).toBeNull()
    const organiser = describeSaleRefusal('walk_in', 'organiser')
    expect(organiser.heading).toBe('Free entry, no ticket needed')
    expect(saleRefusalMessage('walk_in')).toMatch(/needs no ticket, so there is nothing to reserve/)
  })
})

describe('checkSellable: zero ticket types is right for walk-in, any is wrong', () => {
  it('passes a walk-in event with no ticket types', () => {
    expect(checkSellable([], { walkIn: true })).toEqual({ ok: true })
  })
  it('refuses a walk-in event that carries one', () => {
    const r = checkSellable([{ name: 'GA', total_capacity: 100 }], { walkIn: true })
    expect(r.ok).toBe(false)
  })
  it('still refuses a ticketed event with nothing to buy', () => {
    expect(checkSellable([]).ok).toBe(false)
  })
})

describe('the guide parses only the shape the page was drawn for', () => {
  it('fills defaults and drops unknown keys', () => {
    const r = parseGuide({ days: [{ date: '2026-11-20', opens: null, closes: '22:00', hours_label: '10am or 11am, to confirm' }], surprise: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.guide.days[0].items).toEqual([])
    expect(r.guide.days[0].closer).toBeNull()
    expect('surprise' in r.guide).toBe(false)
    expect(r.guide.at_a_glance).toEqual([])
  })

  it('refuses a fifth at-a-glance tile, as the database does', () => {
    const tile = { value: 'Free', label: 'for every visitor' }
    expect(parseGuide({ at_a_glance: [tile, tile, tile, tile, tile] }).ok).toBe(false)
  })

  it('a day with no finish parses, with no close (the 21 October 22:25 answer 1)', () => {
    const r = parseGuide({ days: [{ date: '2026-11-20', opens: '18:30', closes: null }] })
    expect(r.ok).toBe(true)
    expect(r.ok && r.guide.days[0].closes).toBeNull()
  })

  it('refuses a clock that is not HH:MM', () => {
    expect(parseGuide({ days: [{ date: '2026-11-20', opens: '10am', closes: '22:00' }] }).ok).toBe(false)
  })

  it('keeps organiser words, dollar signs included, exactly as written', () => {
    // Lawal, 21 October 2026: organiser text shows as written, prices included.
    const r = parseGuide({ highlights: [{ title: 'Food', body: 'Food stalls from $10' }] })
    expect(r.ok && r.guide.highlights[0].body).toBe('Food stalls from $10')
  })
})

describe('clock and hours read the way design A writes them', () => {
  it.each([
    ['10:00', '10am'],
    ['22:00', '10pm'],
    ['22:30', '10:30pm'],
    ['00:00', '12am'],
    ['12:00', '12pm'],
    ['09:05', '9:05am'],
  ])('%s is %s', (clock, words) => {
    expect(formatClock(clock)).toBe(words)
  })

  it('a day with no finish has no close, never a made up one', () => {
    expect(dayHours(day('2026-11-20', { opens: '18:30', closes: null }))).toEqual({
      opens: '6:30pm',
      unconfirmed: null,
      closes: null,
    })
  })

  it('the page reads a day with no finish as "From" its opening, and a day with one as before', () => {
    const html = (closes: string | null) =>
      renderToStaticMarkup(createElement(HoursText, { hours: dayHours(day('2026-11-20', { opens: '18:30', closes })) }))
    expect(html(null)).toBe('From 6:30pm')
    expect(html('22:00')).toBe('6:30pm to 10pm')
  })

  it('an unconfirmed opening shows the organiser words instead of a time', () => {
    expect(dayHours(day('2026-11-20', { opens: null, hours_label: '10am or 11am, to confirm' }))).toEqual({
      opens: null,
      unconfirmed: '10am or 11am, to confirm',
      closes: '10pm',
    })
  })
})

describe('the days of an event, in its own zone', () => {
  it('a Fri to Sun festival is three dates', () => {
    expect(spanDates('2026-11-19T23:00:00Z', '2026-11-22T09:00:00Z', 'Australia/Melbourne')).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
  })

  it('a 9pm to 2am night offers two dates, and the organiser may keep only the first', () => {
    const span = spanDates('2026-11-20T10:00:00Z', '2026-11-20T15:00:00Z', 'Australia/Melbourne')
    expect(span).toEqual(['2026-11-20', '2026-11-21'])
    expect(
      walkInHoursProblems([day('2026-11-20', { opens: '21:00', closes: '02:00' })], {
        startsAt: '2026-11-20T10:00:00Z',
        endsAt: '2026-11-20T15:00:00Z',
        timezone: 'Australia/Melbourne',
      }),
    ).toEqual([])
  })
})

describe('walkInHoursProblems: what stops a walk-in event being published', () => {
  const EVENT = { startsAt: '2026-11-19T23:00:00Z', endsAt: '2026-11-22T09:00:00Z', timezone: 'Australia/Melbourne' }

  it('no days at all', () => {
    expect(walkInHoursProblems([], EVENT)[0]).toMatch(/Add the hours for each day/)
  })
  it('a day outside the event dates', () => {
    expect(walkInHoursProblems([day('2026-11-20'), day('2026-11-25')], EVENT).join(' ')).toMatch(/outside the event/)
  })
  it('a day with neither an opening time nor a to-confirm label', () => {
    expect(walkInHoursProblems([day('2026-11-20', { opens: null })], EVENT).join(' ')).toMatch(/no opening time/)
  })
  it('a to-confirm label is enough', () => {
    expect(walkInHoursProblems([day('2026-11-20', { opens: null, hours_label: '10am or 11am' })], EVENT)).toEqual([])
  })
  it('the first day must be the start date', () => {
    expect(walkInHoursProblems([day('2026-11-21')], EVENT).join(' ')).toMatch(/must be the day the event starts, 2026-11-20/)
  })
  it('days in order, each once', () => {
    expect(walkInHoursProblems([day('2026-11-20'), day('2026-11-22'), day('2026-11-21')], EVENT)).toContain('List the days in date order.')
    expect(walkInHoursProblems([day('2026-11-20'), day('2026-11-20')], EVENT).join(' ')).toMatch(/listed twice/)
  })
  it('the AMCF weekend publishes', () => {
    expect(
      walkInHoursProblems(
        [
          day('2026-11-20', { opens: null, hours_label: '10am or 11am, to confirm' }),
          day('2026-11-21'),
          day('2026-11-22', { closes: '20:00' }),
        ],
        EVENT,
      ),
    ).toEqual([])
  })
})

describe('walkInFactsFromRow: one rule for every publish path', () => {
  const ROW = { start_date: '2026-11-19T23:00:00Z', end_date: '2026-11-22T09:00:00Z', timezone: 'Australia/Melbourne', tierCount: 0 }

  it('a ticketed event has no walk-in facts', () => {
    expect(walkInFactsFromRow({ ...ROW, entry_mode: 'tickets', guideDays: null })).toBeNull()
  })
  it('an unreadable guide gives no days, so the gate refuses rather than passes', () => {
    const facts = walkInFactsFromRow({ ...ROW, entry_mode: 'walk_in', guideDays: [{ date: 'nonsense' }] })
    expect(facts?.days).toEqual([])
  })
  it('reads an embedded guide as an object or an array', () => {
    expect(embeddedGuideDays({ days: [1] })).toEqual([1])
    expect(embeddedGuideDays([{ days: [2] }])).toEqual([2])
    expect(embeddedGuideDays(null)).toBeNull()
  })
})

describe('checkPublishGate judges a walk-in event on its hours and never asks Stripe', () => {
  /** A client that fails the test if the gate reads anything: walk-in needs no organisation read. */
  const untouchable = new Proxy({}, { get: () => { throw new Error('the gate read the database for a walk-in event') } }) as never
  const BASE = {
    organisationId: 'org_1',
    tiersHavePaid: false,
    coverImageUrl: 'https://x/y.jpg',
    endsAt: FUTURE(4),
    isPhysical: true,
    venueName: 'Fed Square',
    venueAddress: 'Swanston St and Flinders St, Melbourne',
  }
  const span = { startsAt: FUTURE(2), endsAt: FUTURE(4), timezone: 'Australia/Melbourne' }
  const firstDate = spanDates(span.startsAt, span.endsAt, span.timezone)[0]

  it('publishes a walk-in event with its hours, without a single read', async () => {
    const r = await checkPublishGate(untouchable, { ...BASE, walkIn: { tierCount: 0, days: [day(firstDate)], ...span } }, null)
    expect(r).toEqual({ ok: true })
  })

  it('refuses one with no hours, naming what to add', async () => {
    const r = await checkPublishGate(untouchable, { ...BASE, walkIn: { tierCount: 0, days: [], ...span } }, null)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('walk_in_hours_missing')
    expect(r.message).toMatch(/Add the hours for each day/)
  })

  it('refuses one carrying a ticket type', async () => {
    const r = await checkPublishGate(untouchable, { ...BASE, walkIn: { tierCount: 1, days: [day(firstDate)], ...span } }, null)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('walk_in_has_ticket_types')
  })

  it('still refuses a walk-in event with no cover, before anything else', async () => {
    const r = await checkPublishGate(untouchable, { ...BASE, coverImageUrl: null, walkIn: { tierCount: 0, days: [day(firstDate)], ...span } }, null)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('cover_image_required')
  })
})

describe('the structured data describes a walk-in event as free at price 0', () => {
  const event = {
    id: 'evt_walk',
    slug: 'amcf-2026',
    title: 'African Music and Cultural Festival 2026',
    status: 'published',
    entry_mode: 'walk_in',
    timezone: 'Australia/Melbourne',
    summary: 'Three days of African music, food and dance.',
    description: null,
    cover_image_url: 'https://cdn.example.com/amcf.avif',
    start_date: '2026-11-19T23:00:00Z',
    end_date: '2026-11-22T09:00:00Z',
    created_at: '2026-10-21T00:00:00Z',
    event_type: 'in_person',
    venue_name: 'Fed Square',
    venue_address: 'Swanston St and Flinders St',
    venue_city: 'Melbourne',
    venue_state: 'VIC',
    venue_postal_code: '3000',
    venue_country: 'AU',
    category: { slug: 'festival', name: 'Festival' },
  }
  const payload = buildEventSchemaPayload({
    event: event as never,
    organisation: { name: 'African Music and Cultural Festival', slug: 'amcf', description: null },
    ticketTiers: [],
    state: 'upcoming',
    baseUrl: 'https://www.eventlinqs.com.au',
  } as never) as Record<string, unknown>

  it('carries one Offer at price 0 in AUD, and isAccessibleForFree', () => {
    const offers = payload.offers as Array<Record<string, unknown>>
    expect(offers).toHaveLength(1)
    expect(Number(offers[0].price)).toBe(0)
    expect(offers[0].priceCurrency).toBe('AUD')
    expect(offers[0].name).toBe(FREE_ENTRY_LABEL)
    expect(payload.isAccessibleForFree).toBe(true)
  })

  it('is ONE Event spanning the festival, start to end', () => {
    expect(Date.parse(String(payload.startDate))).toBe(Date.parse(event.start_date))
    expect(Date.parse(String(payload.endDate))).toBe(Date.parse(event.end_date))
  })

  it('passes the same validator the production audit uses', () => {
    const { errors } = validateEventNode(payload) as { errors: string[] }
    expect(errors).toEqual([])
  })

  it('says nothing about a ticket or a booking', () => {
    expect(JSON.stringify(payload)).not.toMatch(/\b(tickets?|book\w*)\b/i)
  })
})
