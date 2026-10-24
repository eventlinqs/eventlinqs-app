import { describe, expect, it } from 'vitest'
import {
  LISTINGS_ORGANISATION_SLUG,
  isEventLinqsListing,
  isListingsOrganisation,
  shownOrganiser,
} from '@/lib/listings/shown-organiser'

/**
 * WI2 ruling A of 23 October 2026: "the listings organisation is Lawal's and is
 * never shown ... every artefact of an EventLinqs listing names its host".
 */

const LISTINGS = { name: 'EventLinqs listings', slug: LISTINGS_ORGANISATION_SLUG, short_name: null, website: 'https://eventlinqs.com.au', instagram_handle: 'eventlinqs' }
const AMCF = { name: 'African Music and Cultural Festival', slug: 'amcf', short_name: 'AMCF', website: 'https://amcf.org.au', instagram_handle: 'AMCFOZ' }

describe('who a page names as the organiser', () => {
  it('an EventLinqs listing names its host, with no organiser page, no links and no Follow', () => {
    const shown = shownOrganiser({ listing_source: 'eventlinqs', venue_name: "Murphy's Geelong" }, LISTINGS)
    expect(shown).toEqual({ name: "Murphy's Geelong", slug: null, shortName: null, website: null, instagram: null, followable: false })
  })

  it('never the listings organisation, even if a row were held by it without the listing flag', () => {
    const shown = shownOrganiser({ listing_source: 'organiser', venue_name: 'Sailors Rest' }, LISTINGS)
    expect(shown.name).toBe('Sailors Rest')
    expect(shown.slug).toBeNull()
    expect(shown.followable).toBe(false)
  })

  it('a listing with no venue name still names no organisation', () => {
    expect(shownOrganiser({ listing_source: 'eventlinqs', venue_name: '  ' }, LISTINGS).name).toBe('The venue')
  })

  it("an organiser's own event names its organisation, links its page and can be followed", () => {
    expect(shownOrganiser({ listing_source: 'organiser', venue_name: 'Fed Square' }, AMCF)).toEqual({
      name: 'African Music and Cultural Festival',
      slug: 'amcf',
      shortName: 'AMCF',
      website: 'https://amcf.org.au',
      instagram: 'AMCFOZ',
      followable: true,
    })
  })

  it('the flags', () => {
    expect(isEventLinqsListing({ listing_source: 'eventlinqs' })).toBe(true)
    expect(isEventLinqsListing({ listing_source: 'organiser' })).toBe(false)
    expect(isEventLinqsListing(null)).toBe(false)
    expect(isListingsOrganisation('eventlinqs-listings')).toBe(true)
    expect(isListingsOrganisation('amcf')).toBe(false)
  })
})
