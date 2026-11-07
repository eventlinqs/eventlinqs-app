import { describe, expect, it } from 'vitest'
import { categoryShown, expectedOfferCents, liveOfferCents, priceAgrees } from '@/lib/listings/verifier-fields'
import type { BookingLink } from '@/lib/events/booking-links'

/*
 * PRICE AND CATEGORY IN THE VERIFIER'S SAMPLE (WINDOW 5A's 09:44 of 7 November 2026, the CONTROLLER's 10:16: LAW 19 section
 * 3 asks the 20 event sample field by field, and the verifier compared the start, venue, city and link but not the price or
 * the category). The stored side is built by the schema's own rule (the button's link, then the others, each price only
 * while fresh), the live side read from the page's JSON-LD and its hero, so a wrong figure or a missing category fails.
 */
const now = new Date('2026-11-07T00:00:00Z')
const link = (over: Partial<BookingLink>): BookingLink => ({
  id: 'l', provider: 'ticketek', url: 'https://premier.ticketek.com.au/x', kind: 'tickets', availability: 'on_sale',
  priceFromCents: 3550, priceCheckedAt: '2026-11-06T00:00:00Z', isPrimary: true, setBy: 'curated', pointedToByOrganiser: false,
  position: 0, createdAt: '2026-11-01T00:00:00Z', ...over,
} as BookingLink)

describe('the price the page should offer', () => {
  it("the button's fresh price", () => {
    expect(expectedOfferCents([link({})], now)).toBe(3550)
  })
  it('a price checked too long ago is not offered', () => {
    expect(expectedOfferCents([link({ priceCheckedAt: '2026-08-01T00:00:00Z' })], now)).toBeNull()
  })
  it('a free registration offers 0', () => {
    expect(expectedOfferCents([link({ kind: 'free_register', priceFromCents: null, priceCheckedAt: null })], now)).toBe(0)
  })
})

describe('the price the live page offers', () => {
  it('reads the first Offer in the JSON-LD, in cents', () => {
    const html = '<script type="application/ld+json">{"@type":"MusicEvent","offers":[{"@type":"Offer","price":"35.50","priceCurrency":"AUD"},{"@type":"Offer","price":"40.00"}]}</script>'
    expect(liveOfferCents(html)).toBe(3550)
  })
  it('an Offer with no price, or no Offer, is null', () => {
    expect(liveOfferCents('{"offers":[{"@type":"Offer","availability":"https://schema.org/InStock","url":"x"}]}')).toBeNull()
    expect(liveOfferCents('<html></html>')).toBeNull()
  })
  it('agrees only on the same figure, or on none at all', () => {
    expect(priceAgrees(3550, 3550)).toBe(true)
    expect(priceAgrees(null, null)).toBe(true)
    expect(priceAgrees(3550, 2900)).toBe(false)
    expect(priceAgrees(3550, null)).toBe(false)
  })
})

describe('the category the live page shows', () => {
  it('is the stored category, in the hero before the title', () => {
    expect(categoryShown('SPORTS 2026 Boxing Day Test Day 1', '2026 Boxing Day Test Day 1', 'Sports')).toBe(true)
    expect(categoryShown('THEATRE AND PERFORMING ARTS Macbeth', 'Macbeth', 'Theatre and performing arts')).toBe(true)
  })
  it('a category shown only further down the page is not the hero', () => {
    expect(categoryShown('MUSIC 2026 Boxing Day Test ... more Sports events', '2026 Boxing Day Test', 'Sports')).toBe(false)
  })
  it('no stored category is not judged', () => {
    expect(categoryShown('anything', 'x', null)).toBeNull()
  })
})
