import { describe, expect, it } from 'vitest'
import { pageRuleFor, eventPagesFromSitemap } from '@/lib/listings/page-rules'

/*
 * LOVE CENTRAL GEELONG (capture under the PM's 09:45 of 13 November 2026, Victoria after Melbourne). Read that morning by
 * the polite reader: its sitemap lists each event page under /events/, and each carries schema.org Event data, which the
 * rule reads with the collector's own JSON-LD reader. Built by hand in the same shape, never copied from theirs.
 */

const URL = 'https://www.centralgeelong.com.au/events/bp-proof-street-festival/'
const ld = (o: Record<string, unknown>) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', ...o })}</script>`
const page = (event: string) => `<!doctype html><html><head>${event}</head><body><h1>Bp Proof Street Festival</h1></body></html>`

const rule = () => {
  const r = pageRuleFor(URL)
  if (!r) throw new Error('no rule for Love Central Geelong')
  return r
}

describe('the Love Central Geelong rule', () => {
  it('is found for its event pages, and its sitemap gives the event pages only', () => {
    const xml = `<urlset><url><loc>https://www.centralgeelong.com.au/events/</loc></url><url><loc>${URL}</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule())).toEqual([URL])
  })

  it("reads the page's own Event data: title, start and place", () => {
    const found = rule().read(page(ld({ name: 'Bp Proof Street Festival', startDate: '2027-03-06T10:00:00+11:00', location: { '@type': 'Place', name: 'Little Malop Street', address: 'Little Malop Street, Geelong VIC 3220' } })), URL)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ title: 'Bp Proof Street Festival', startsAt: '2027-03-05T23:00:00.000Z', venueName: 'Little Malop Street', pageUrl: URL })
  })

  it('reads nothing from a page that carries no Event', () => {
    expect(rule().read(page(''), URL)).toEqual([])
  })
})
