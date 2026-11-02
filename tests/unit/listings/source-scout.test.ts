import { describe, expect, it } from 'vitest'
import { proposedSource, scoutSite } from '@/lib/listings/source-scout'

/**
 * THE DISCOVERY LAYER'S SOURCE SCOUT (the CONTROLLER's 16:14 (4) of 1 November 2026: the discovery layer finds NEW
 * SOURCES and registers each, routed to the adapter that may read it). Pure: given what one site answered (robots.txt's
 * verdict, the page, its sitemaps), it names the adapter and the reason, in this order: a site that refuses is never
 * read; a feed beats page data; Event data beats a page rule; a written rule; event pages in its own sitemap mean a rule
 * is to be written; otherwise nothing to read. A proposed source is never read until a person confirms its terms.
 */

const page = (body: string) => `<html><head></head><body>${body}</body></html>`

describe('the adapter a site can be read by', () => {
  it('a site whose robots.txt disallows the page, or that answers 403 or 429, is never read', () => {
    expect(scoutSite({ url: 'https://a.example.com/events', robotsAllowed: false, status: 200, html: page(''), sitemapUrls: [] })).toMatchObject({ adapter: 'none', reason: 'robots.txt disallows the page' })
    expect(scoutSite({ url: 'https://a.example.com/events', robotsAllowed: true, status: 403, html: '', sitemapUrls: [] })).toMatchObject({ adapter: 'none', reason: 'the site answered 403: never read' })
    expect(scoutSite({ url: 'https://a.example.com/events', robotsAllowed: true, status: 429, html: '', sitemapUrls: [] }).adapter).toBe('none')
  })

  it('a calendar feed on the page is read as iCal, and the feed is named', () => {
    const v = scoutSite({ url: 'https://club.example.com.au/events/', robotsAllowed: true, status: 200, html: page('<a href="/events/?ical=1">Export</a><a href="webcal://club.example.com.au/cal.ics">Subscribe</a>'), sitemapUrls: [] })
    expect(v).toMatchObject({ adapter: 'ics', feeds: ['https://club.example.com.au/events/?ical=1', 'webcal://club.example.com.au/cal.ics'] })
  })

  it("the page's own Event data is read as JSON-LD", () => {
    const v = scoutSite({ url: 'https://venue.example.com.au/whats-on', robotsAllowed: true, status: 200, html: page('<script type="application/ld+json">{"@type":"MusicEvent","name":"A"}</script>'), sitemapUrls: [] })
    expect(v).toMatchObject({ adapter: 'jsonld', jsonldEvents: 1 })
  })

  it('a site with a written page rule is read by it', () => {
    expect(scoutSite({ url: 'https://geelongartscentre.org.au/whats-on/', robotsAllowed: true, status: 200, html: page('<h1>What is on</h1>'), sitemapUrls: [] })).toMatchObject({ adapter: 'page_rule', ruleWritten: true })
  })

  it('event pages in its own sitemap: a page rule is to be written', () => {
    const v = scoutSite({ url: 'https://pub.example.com.au/', robotsAllowed: true, status: 200, html: page('<p>Welcome</p>'), sitemapUrls: ['https://pub.example.com.au/page-sitemap.xml', 'https://pub.example.com.au/event-sitemap.xml'] })
    expect(v).toMatchObject({ adapter: 'page_rule', ruleWritten: false, eventSitemaps: ['https://pub.example.com.au/event-sitemap.xml'] })
    expect(v.reason).toMatch(/rule is to be written/)
  })

  it('nothing to read says so, never a guess', () => {
    expect(scoutSite({ url: 'https://quiet.example.com.au/', robotsAllowed: true, status: 200, html: page('<p>Open daily</p>'), sitemapUrls: [] })).toMatchObject({ adapter: 'none', reason: 'no event data, feed or event sitemap found' })
  })
})

describe('a proposed source', () => {
  it('is registered asking, unverified, facts only, in its city, never read until a person confirms its terms', () => {
    const v = scoutSite({ url: 'https://club.example.com.au/events/', robotsAllowed: true, status: 200, html: page('<a href="/events/?ical=1">x</a>'), sitemapUrls: [] })
    expect(proposedSource(v, { name: 'Club Example', citySlug: 'geelong', kind: 'venue' })).toEqual({
      name: 'Club Example',
      kind: 'venue',
      city_slug: 'geelong',
      page_url: 'https://club.example.com.au/events/?ical=1',
      collection: 'ask',
      verification: 'unverified',
      changes: 'weekly',
      permits_facts: true,
      permits_descriptions: false,
      permits_images: false,
      permits_links: true,
      notes: 'proposed by the source scout: ics (a calendar feed on the page); read only once a person confirms its terms',
    })
  })

  it('a site never to be read is not proposed', () => {
    const v = scoutSite({ url: 'https://a.example.com/', robotsAllowed: false, status: 200, html: '', sitemapUrls: [] })
    expect(proposedSource(v, { name: 'A', citySlug: 'geelong', kind: 'venue' })).toBeNull()
  })
})
