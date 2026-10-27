import { describe, expect, it } from 'vitest'
import { freeListingOutbound, outboundHost, ticketButtonLabel } from '@/lib/listings/outbound'

/*
 * WI3's page: every curated listing carries one button that leaves for its host's
 * own page or booking site (Lawal's finding of 27 October 2026). The leaf that
 * picks it, tested without a database.
 */

describe('freeListingOutbound', () => {
  it("sends a free night to the host's own site, named for the host", () => {
    expect(freeListingOutbound('a-night', "Beav's Bar", { websiteUrl: 'https://www.beavsbar.com.au/' })).toEqual({
      href: 'https://www.beavsbar.com.au/',
      label: "See it on Beav's Bar's page",
      host: 'beavsbar.com.au',
    })
  })

  it("prefers the night's own page, then the host's site, then its post, then the page the import last read", () => {
    const all = {
      sourceUrl: 'https://beavsbar.com.au/whats-on/trivia',
      websiteUrl: 'https://beavsbar.com.au/',
      instagramPostUrl: 'https://www.instagram.com/p/AbC123/',
      checkedUrl: 'https://someguide.example/beavs',
    }
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', all)?.href).toBe(all.sourceUrl)
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', { ...all, sourceUrl: null })?.href).toBe(all.websiteUrl)
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', { ...all, sourceUrl: null, websiteUrl: null })?.href).toBe(all.instagramPostUrl)
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', { checkedUrl: all.checkedUrl })).toMatchObject({ href: all.checkedUrl, label: 'See the original listing' })
  })

  it("never calls another site's listing the host's page (found driving production, 27 October 2026)", () => {
    const listing = 'https://whatson.melbourne.vic.gov.au/things-to-do/damn-fine-laughs'
    expect(freeListingOutbound('a-night', 'FAD Gallery Bar', { sourceUrl: listing })).toEqual({ href: listing, label: 'See the original listing', host: 'whatson.melbourne.vic.gov.au' })
    expect(freeListingOutbound('a-night', 'FAD Gallery Bar', { checkedUrl: listing })?.label).toBe('See the original listing')
  })

  it("prefers the host's own site over another site's listing of the night", () => {
    const p = freeListingOutbound('a-night', 'FAD Gallery Bar', { sourceUrl: 'https://whatson.melbourne.vic.gov.au/x', websiteUrl: 'https://fadgallery.com.au' })
    expect([p?.href, p?.label]).toEqual(['https://fadgallery.com.au', "See it on FAD Gallery Bar's page"])
  })

  it('draws no button where the listing holds no real https page (Law 5: never a dead link)', () => {
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', {})).toBeNull()
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', { websiteUrl: 'http://beavsbar.com.au', checkedUrl: 'not a url', sourceUrl: '  ' })).toBeNull()
  })

  it('never sends a visitor back to EventLinqs as if it were the host', () => {
    expect(freeListingOutbound('a-night', 'Beav\'s Bar', { sourceUrl: 'https://www.eventlinqs.com.au/events/x', websiteUrl: 'https://beavsbar.com.au' })?.host).toBe('beavsbar.com.au')
  })

  it('names the host plainly when the listing has no name for it', () => {
    expect(freeListingOutbound('a-night', '  ', { websiteUrl: 'https://beavsbar.com.au' })?.label).toBe("See it on the host's page")
  })
})

describe('ticketButtonLabel', () => {
  it('names it from the address where no provider is recorded', () => {
    expect(ticketButtonLabel('https://www.eventbrite.com.au/e/123')).toBe('Get tickets on Eventbrite')
    expect(ticketButtonLabel('https://www.moshtix.com.au/v2/event/1')).toBe('Get tickets on Moshtix')
    expect(ticketButtonLabel('https://dice.fm/event/abc')).toBe('Get tickets on DICE')
  })

  it("keeps the plain words for a venue's own booking page", () => {
    expect(ticketButtonLabel('https://beavsbar.com.au/book')).toBe('Get tickets')
  })
})

describe('outboundHost', () => {
  it('reads https hosts only', () => {
    expect(outboundHost('https://www.beavsbar.com.au/x')).toBe('beavsbar.com.au')
    expect(outboundHost('http://beavsbar.com.au')).toBeNull()
    expect(outboundHost(null)).toBeNull()
  })
})
