import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor } from '@/lib/listings/page-rules'

/**
 * MELBOURNE'S PAGE RULES (WINDOW 2, 1 November 2026). Comedy Republic's show pages carry one schema.org Event per
 * performance; its sitemap names the show pages. The fixture is written for this test in that shape, not copied.
 */

const CR = 'https://www.comedyrepublic.com.au'
const perf = (date: string, slot: string) => ({
  '@context': 'https://schema.org',
  '@type': 'ComedyEvent',
  name: 'Bp Proof Bingo',
  startDate: `${date}T${slot}:00+11:00`,
  endDate: `${date}T21:30:00+11:00`,
  eventStatus: 'https://schema.org/EventScheduled',
  description: 'The presenter\'s own words, never kept.',
  image: 'https://static.example/poster.jpg',
  location: { '@type': 'Place', name: 'Comedy Republic', address: { '@type': 'PostalAddress', streetAddress: 'Level 1, 231 Bourke St', addressLocality: 'Melbourne', postalCode: '3000' } },
  offers: { '@type': 'Offer', price: '25', priceCurrency: 'AUD', url: `${CR}/shows/bp-proof-bingo/?date=${date}&slot=${slot.replace(':', '')}`, availability: 'https://schema.org/InStock' },
})
const page = `<html><head><script type="application/ld+json">${JSON.stringify([perf('2026-11-30', '19:30'), perf('2027-01-04', '19:30')])}</script></head><body><h1>Bp Proof Bingo</h1></body></html>`

describe('the Comedy Republic rule', () => {
  const url = `${CR}/shows/bp-proof-bingo/`
  const rule = pageRuleFor(url)

  it('is found for its show pages, and its sitemap leads only to them', () => {
    expect(rule).not.toBeNull()
    expect(rule!.host).toBe('comedyrepublic.com.au')
    const xml = `<urlset><url><loc>${CR}/shows/bp-proof-bingo/</loc></url><url><loc>${CR}/whats-on/calendar/</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule!)).toEqual([url])
  })

  it('reads one night per performance from the page\'s own Event data, at its stated start, with its venue', () => {
    const found = rule!.read(page, url)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ title: 'Bp Proof Bingo', startsAt: '2026-11-30T08:30:00.000Z', venueName: 'Comedy Republic' })
    expect(found[1].startsAt).toBe('2027-01-04T08:30:00.000Z')
    expect(found[0].links.length).toBeGreaterThan(0)
  })
})
