// ONE NIGHT'S PRICE AND AVAILABILITY, NEVER THE WHOLE PAGE'S (WINDOW 5, 6 November 2026, the engine accuracy sweep of the
// CONTROLLER's 20:34). Comedy Republic's Main Stage page sells each night at its own price (the checked file of 1 November read
// $22 Wednesday, $29 Thursday, $34 Friday, $39 Saturday), and every night's link is that one page; the daily link check pooled
// every Event's offers on it and wrote the lowest, $22, onto all of them, and 'on sale' wherever any show was, so a sold out
// night (Cosi at Geelong Arts Centre, Granny Bingo) kept its Get tickets. Where a page holds several dated Events, a night now
// reads only its own; a page with none for that night says nothing about it.

import { describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

import { checkLink, readPage, type CheckDeps } from '@/lib/events/link-check'
import { runLinkCheck } from '@/lib/events/link-check-run'

const show = (startDate: string, price: number, availability: string) => ({
  '@type': 'ComedyEvent', name: 'Comedy Republic Main Stage', startDate,
  offers: { '@type': 'Offer', price, priceCurrency: 'AUD', availability: `https://schema.org/${availability}` },
})
const page = (...events: unknown[]) => `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': events })}</script></head></html>`
const week = page(
  show('2026-11-04T20:00:00+11:00', 22, 'InStock'),
  show('2026-11-05T20:00:00+11:00', 29, 'InStock'),
  show('2026-11-07T20:00:00+11:00', 39, 'SoldOut'),
)
const zone = 'Australia/Melbourne'

describe('a page of several dated nights', () => {
  test("each night reads its own offer: Saturday is $39 and sold out, Wednesday $22 and on sale", () => {
    expect(readPage(200, week, { startsAt: '2026-11-07T09:00:00.000Z', zone })).toEqual({ availability: 'sold_out', priceFromCents: 3900 })
    expect(readPage(200, week, { startsAt: '2026-11-04T09:00:00.000Z', zone })).toEqual({ availability: 'on_sale', priceFromCents: 2200 })
  })

  test('a night the page does not hold is said nothing about, so nothing is written to it', () => {
    expect(readPage(200, week, { startsAt: '2026-11-06T09:00:00.000Z', zone })).toEqual({ availability: null, priceFromCents: null })
  })

  test('a date only startDate is that local day', () => {
    const days = page(show('2026-11-13', 25, 'InStock'), show('2026-11-14', 32, 'SoldOut'))
    expect(readPage(200, days, { startsAt: '2026-11-14T08:30:00.000Z', zone })).toEqual({ availability: 'sold_out', priceFromCents: 3200 })
  })

  test('one Event, or none dated, reads as before, night or not', () => {
    const one = page(show('2026-11-04T20:00:00+11:00', 22, 'InStock'))
    expect(readPage(200, one, { startsAt: '2026-11-21T09:00:00.000Z', zone })).toEqual({ availability: 'on_sale', priceFromCents: 2200 })
    expect(readPage(200, week)).toEqual({ availability: 'on_sale', priceFromCents: 2200 })
  })

  test('the daily run reads the shared page once and writes each night its own price and availability', async () => {
    const url = 'https://www.comedyrepublic.com.au/shows/main-stage/'
    const links = [
      { id: 'wed', url, availability: 'on_sale', price_from_cents: 2200, events: { start_date: '2026-11-04T09:00:00.000Z', timezone: zone } },
      { id: 'sat', url, availability: 'on_sale', price_from_cents: 2200, events: { start_date: '2026-11-07T09:00:00.000Z', timezone: zone } },
    ]
    const writes: { id: string; row: Record<string, unknown> }[] = []
    const admin = {
      from: () => ({
        select: () => ({ gte: () => ({ limit: async () => ({ data: links, error: null }) }) }),
        update: (row: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { writes.push({ id, row }); return { error: null } } }),
      }),
    } as unknown as SupabaseClient
    const gets: string[] = []
    const deps: CheckDeps = { async get(u) { gets.push(u); return u.endsWith('/robots.txt') ? { status: 404, body: '' } : { status: 200, body: week } } }
    const summary = await runLinkCheck(admin, deps, new Date('2026-11-03T00:00:00Z'))
    expect(gets.filter((g) => g === url)).toHaveLength(1)
    expect(summary.changed).toBe(1)
    expect(writes).toEqual([{ id: 'sat', row: expect.objectContaining({ availability: 'sold_out', price_from_cents: 3900 }) }])
  })

  test("a page the engine reads by its own page rule is read the same way: Cosi's Fri 13 Nov sold out, Sat 14 Nov on sale", async () => {
    // Geelong Arts Centre's pages carry no Event data; their 'Performances:' block marks each sold out night (page-rules.ts).
    const gac = [
      '<html><body><h1>Cosi - Geelong Repertory Theatre Company</h1>',
      '<p>Performances:</p><p>Fri 13 Nov 2026 7:30pm Sold Out</p><p>Sat 14 Nov 2026 7:30pm</p>',
      '<p>Ticket Prices:</p><p>Adult $29.00</p><p>Venue:</p><p>Woodbin Theatre</p><p>Venue info</p>',
      '</body></html>',
    ].join('')
    const url = 'https://geelongartscentre.org.au/whats-on/all-events/cosi/'
    const deps: CheckDeps = { async get(u) { return u.endsWith('/robots.txt') ? { status: 404, body: '' } : { status: 200, body: gac } } }
    expect(await checkLink(url, deps, new Map(), { startsAt: '2026-11-13T08:30:00.000Z', zone })).toEqual({ changed: true, availability: 'sold_out', priceFromCents: 2900 })
    expect(await checkLink(url, deps, new Map(), { startsAt: '2026-11-14T08:30:00.000Z', zone })).toEqual({ changed: true, availability: 'on_sale', priceFromCents: 2900 })
    // A night the rule does not find on its page is said nothing about.
    expect(await checkLink(url, deps, new Map(), { startsAt: '2026-11-15T03:00:00.000Z', zone })).toEqual({ changed: false, why: 'unknown' })
  })

  test("the from price is the open ticket's, never a concession's: the Peter Tobin Oration is $15, not $12", () => {
    const tobin = page({
      '@type': 'Event', name: 'The Peter Tobin Oration with Cathy McGowan AO', startDate: '2026-12-04T18:00:00+11:00',
      offers: [
        { '@type': 'Offer', name: 'Concession', price: 12, priceCurrency: 'AUD', availability: 'https://schema.org/InStock' },
        { '@type': 'Offer', name: 'General Admission', price: 15, priceCurrency: 'AUD', availability: 'https://schema.org/InStock' },
      ],
    })
    expect(readPage(200, tobin)).toEqual({ availability: 'on_sale', priceFromCents: 1500 })
    // Only restricted tickets left on sale: still on sale (a concession buyer can buy), and no open price to state.
    const onlyConcession = page({
      '@type': 'Event', name: 'The Peter Tobin Oration with Cathy McGowan AO', startDate: '2026-12-04T18:00:00+11:00',
      offers: [
        { '@type': 'Offer', name: 'Concession', price: 12, priceCurrency: 'AUD', availability: 'https://schema.org/InStock' },
        { '@type': 'Offer', name: 'General Admission', price: 15, priceCurrency: 'AUD', availability: 'https://schema.org/SoldOut' },
      ],
    })
    expect(readPage(200, onlyConcession)).toEqual({ availability: 'on_sale', priceFromCents: 1500 })
  })

  test("a rule that does not state availability never asserts 'on sale': Bird's Basement gives its price alone", async () => {
    // Its Event data carries no availability and a $29.00 placeholder; its page states 'Price Range: From $45 + booking fee'.
    const birds = [
      '<html><head><script type="application/ld+json">',
      JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', name: 'Fleetwood Max', startDate: '2026-11-14', location: { '@type': 'Place', name: "Bird's Basement", address: '11 Singers Lane, Melbourne VIC 3000' }, offers: { '@type': 'Offer', price: '29.00', priceCurrency: 'AUD', url: 'https://birdsbasement.com/show/1760/fleetwood-max' } }),
      '</script></head><body><h1>Fleetwood Max</h1><p>Price Range: From $50 + booking fee.</p><p>Early Show Starts: 7:30 pm</p></body></html>',
    ].join('')
    const url = 'https://birdsbasement.com/show/1760/fleetwood-max'
    const deps: CheckDeps = { async get(u) { return u.endsWith('/robots.txt') ? { status: 404, body: '' } : { status: 200, body: birds } } }
    expect(await checkLink(url, deps, new Map(), { startsAt: '2026-11-14T08:30:00.000Z', zone })).toEqual({ changed: true, availability: null, priceFromCents: 5000 })
  })

  test('the run writes a price alone where availability is not stated, and keeps the stored availability', async () => {
    const links = [{ id: 'fm', url: 'https://birdsbasement.com/show/1760/fleetwood-max', availability: 'sold_out', price_from_cents: 2900, events: { start_date: '2026-11-14T08:30:00.000Z', timezone: zone } }]
    const writes: { id: string; row: Record<string, unknown> }[] = []
    const admin = {
      from: () => ({
        select: () => ({ gte: () => ({ limit: async () => ({ data: links, error: null }) }) }),
        update: (row: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { writes.push({ id, row }); return { error: null } } }),
      }),
    } as unknown as SupabaseClient
    const body = '<html><body><h1>Fleetwood Max</h1><p>Price Range: From $50 + booking fee.</p><p>Early Show Starts: 7:30 pm</p></body></html>'
      .replace('<html>', `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', name: 'Fleetwood Max', startDate: '2026-11-14', location: { '@type': 'Place', name: "Bird's Basement", address: '11 Singers Lane, Melbourne VIC 3000' }, offers: { '@type': 'Offer', price: '29.00', priceCurrency: 'AUD', url: 'https://birdsbasement.com/show/1760/fleetwood-max' } })}</script></head>`)
    const deps: CheckDeps = { async get(u) { return u.endsWith('/robots.txt') ? { status: 404, body: '' } : { status: 200, body } } }
    await runLinkCheck(admin, deps, new Date('2026-11-06T00:00:00Z'))
    expect(writes).toEqual([{ id: 'fm', row: expect.objectContaining({ price_from_cents: 5000 }) }])
    expect(writes[0].row).not.toHaveProperty('availability')
  })

  test('checkLink carries the night to the read', async () => {
    const deps: CheckDeps = { async get(url) { return url.endsWith('/robots.txt') ? { status: 404, body: '' } : { status: 200, body: week } } }
    expect(await checkLink('https://www.comedyrepublic.com.au/shows/main-stage/', deps, new Map(), { startsAt: '2026-11-07T09:00:00.000Z', zone }))
      .toEqual({ changed: true, availability: 'sold_out', priceFromCents: 3900 })
  })
})
