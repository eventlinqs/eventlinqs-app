import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLAIM_ENTRY_LINK, CLAIM_ENTRY_QUESTION, offersVenueClaim } from '@/lib/listings/claim-entry'

// The way in to a claim from a venue's own page (the gap list's item 2): only while claims are on, only for a venue
// EventLinqs listed that nobody has claimed, by the claim page's own rule.

const listed = { listing_source: 'eventlinqs', claimed_at: null, removed_at: null }

describe('the venue page offers its claim', () => {
  it('only while claims are on, for a listed, unclaimed, present venue', () => {
    expect(offersVenueClaim(true, listed)).toBe(true)
    expect(offersVenueClaim(false, listed)).toBe(false)
    expect(offersVenueClaim(true, { ...listed, claimed_at: '2026-10-30T00:00:00Z' })).toBe(false)
    expect(offersVenueClaim(true, { ...listed, listing_source: 'organiser' })).toBe(false)
    expect(offersVenueClaim(true, { ...listed, removed_at: '2026-10-30T00:00:00Z' })).toBe(false)
    expect(offersVenueClaim(true, null)).toBe(false)
  })

  it('names the venue and says what claiming does, with no exclamation mark', () => {
    expect(CLAIM_ENTRY_QUESTION('Aunty Jacks')).toBe('Run Aunty Jacks?')
    expect(CLAIM_ENTRY_LINK).not.toMatch(/!/)
  })

  it('the venue page links to its claim page behind the listing_claims flag, at the 44px floor', () => {
    const page = readFileSync('src/app/venues/[handle]/page.tsx', 'utf8')
    expect(page).toMatch(/isFeatureEnabled\('listing_claims'\)/)
    expect(page).toMatch(/href=\{`\/venues\/\$\{handle\}\/claim`\}/)
    expect(page).toMatch(/showClaim && \(/)
    expect(page).toMatch(/min-h-11/)
  })
})
