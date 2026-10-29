import { describe, expect, it } from 'vitest'
import { partnerSourceRow, type PartnerFeedInput } from '@/lib/listings/partner-feed'

/* A partner's own feed registered from their yes (the engine plan part E): read daily, their words the evidence. */

const input = (over: Partial<PartnerFeedInput> = {}): PartnerFeedInput => ({
  organisationId: 'org-1',
  organisationName: 'Bp Proof Promotions',
  venueId: 'venue-1',
  venueName: 'The Barwon Club',
  venueCitySlug: 'geelong',
  categoryId: 'cat-1',
  feedUrl: 'https://barwonclub.example.com.au/events/?ical=1',
  feedKind: 'calendar',
  yesUrl: 'https://barwonclub.example.com.au/events/',
  yesWords: "Yes, you're welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.",
  yesOn: '2026-10-28',
  ...over,
})

describe("a partner's feed", () => {
  it('is read daily on their own words, names its venue and category, and takes facts and links only', () => {
    const r = partnerSourceRow(input(), '2026-10-28')
    expect('row' in r).toBe(true)
    if (!('row' in r)) return
    expect(r.row).toMatchObject({
      page_url: 'https://barwonclub.example.com.au/events/?ical=1',
      collection: 'read',
      changes: 'daily',
      source_type: 'venue_partnership',
      organisation_id: 'org-1',
      venue_id: 'venue-1',
      category_id: 'cat-1',
      city_slug: 'geelong',
      may_subscribe: 'yes',
      may_subscribe_url: 'https://barwonclub.example.com.au/events/',
      may_subscribe_read_on: '2026-10-28',
      may_redistribute_facts: 'yes',
      permits_facts: true,
      permits_links: true,
      permits_descriptions: false,
      permits_images: false,
      verification: 'verified',
      verified_on: '2026-10-28',
    })
    expect(r.row.may_subscribe_quote).toBe(input().yesWords)
    expect(r.row).toMatchObject({ may_scrape: 'unknown', may_use_dataset: 'unknown', may_reuse_media: 'unknown' })
  })

  it('answers scraping, not subscription, for an events page carrying their Event data', () => {
    const r = partnerSourceRow(input({ feedKind: 'page', feedUrl: 'https://barwonclub.example.com.au/gigs' }), '2026-10-28')
    expect('row' in r && r.row.may_scrape).toBe('yes')
    expect('row' in r && r.row.may_subscribe).toBe('unknown')
  })

  it('refuses a feed or a yes that is not https, a yes with no words, and a day ahead of today', () => {
    expect(partnerSourceRow(input({ feedUrl: 'http://barwonclub.example.com.au/ical' }), '2026-10-28')).toEqual({ refused: 'The feed must be an https address.' })
    expect(partnerSourceRow(input({ yesUrl: 'mailto:hi@example.com' }), '2026-10-28')).toEqual({ refused: 'Where they said yes must be an https address.' })
    expect(partnerSourceRow(input({ yesWords: '   ' }), '2026-10-28')).toEqual({ refused: 'Their words of permission are needed, as they wrote them.' })
    expect(partnerSourceRow(input({ yesOn: '2026-10-29' }), '2026-10-28')).toEqual({ refused: 'The day they said yes must be a real day, not in the future.' })
  })
})
