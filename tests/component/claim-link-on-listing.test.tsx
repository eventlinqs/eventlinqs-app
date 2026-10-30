import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { listingClaimable, CLAIM_LISTING_LINE } from '@/lib/listings/claimable'
import { ReportListingLink } from '@/components/events/report-listing-link'

/*
 * Window 6's gap list of 30 October 2026, item 2: no public page linked to a claim; only outreach emails carried the
 * link (src/lib/outreach/facts.ts), so an organiser on their own listing had no way in. The event page and the walk-in
 * page now carry a quiet claim line beside "Report or remove this listing", shown where the claim page accepts a claim.
 */

describe('listingClaimable, the claim page and its link alike', () => {
  it('offers a claim on a night EventLinqs listed at a venue on record', () => {
    expect(listingClaimable({ listingSource: 'eventlinqs', hasVenue: true })).toBe(true)
  })

  it("never on an organiser's own night", () => {
    expect(listingClaimable({ listingSource: 'organiser', hasVenue: true })).toBe(false)
    expect(listingClaimable({ listingSource: null, hasVenue: true })).toBe(false)
  })

  it('never where no venue is on record, since the code goes to the venue', () => {
    expect(listingClaimable({ listingSource: 'eventlinqs', hasVenue: false })).toBe(false)
  })
})

describe('the claim line beside the report link', () => {
  it('links the claim page with its words when the listing is claimable', () => {
    const { container } = render(<ReportListingLink slug="kate-ceberano-geelong" claimable />)
    const claim = container.querySelector('a[data-claim-listing-link]')
    expect(claim?.getAttribute('href')).toBe('/events/kate-ceberano-geelong/claim')
    expect(claim?.textContent).toBe(CLAIM_LISTING_LINE)
    expect(container.querySelector('a[data-report-listing-link]')?.getAttribute('href')).toBe('/events/kate-ceberano-geelong/report')
  })

  it('shows no claim line otherwise, and keeps the report link', () => {
    const { container } = render(<ReportListingLink slug="kate-ceberano-geelong" />)
    expect(container.querySelector('a[data-claim-listing-link]')).toBeNull()
    expect(container.querySelector('a[data-report-listing-link]')).not.toBeNull()
  })
})
