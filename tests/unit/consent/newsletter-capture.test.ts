import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  cityNewsletterConsentWording,
  CITY_NEWSLETTER_CONSENT_VERSION,
} from '@/lib/consent/wording'
import { resolveCitySlug } from '@/lib/cities/resolve'

/**
 * The city newsletter capture told people "Subscribed. We'll be in your inbox
 * by next Friday." and stored nothing. These tests exist so that cannot
 * happen again, and so the wording kept as evidence stays the wording shown.
 */

const ROUTE = readFileSync('src/app/api/newsletter/subscribe/route.ts', 'utf8')
const PANEL = readFileSync(
  'src/components/features/city/city-newsletter-capture.tsx',
  'utf8',
)

describe('the endpoint stores what it claims to store', () => {
  it('persists through the consent recorder rather than a log line', () => {
    expect(ROUTE).toContain('recordPlatformDigestConsent')
  })

  it('writes into the table the weekly digest actually reads', () => {
    // recordPlatformDigestConsent is the only writer of marketing_consents,
    // which is the only table fetchDigestRecipients reads for consent rows.
    const recorder = readFileSync('src/lib/consent/record.ts', 'utf8')
    expect(recorder).toContain("from('marketing_consents')")
  })

  it('never reports success when the write failed', () => {
    expect(ROUTE).toMatch(/if \(!stored\)[\s\S]*status: 500/)
  })

  it('refuses a locality that has no digest, rather than storing an unreachable row', () => {
    expect(ROUTE).toMatch(/if \(!citySlug\)[\s\S]*status: 400/)
  })

  it('is rate limited, being public, unauthenticated and now a writer', () => {
    expect(ROUTE).toContain('newsletter-subscribe')
    expect(ROUTE).toMatch(/status: 429/)
  })
})

describe('the wording stored is the wording shown', () => {
  it('carries the panel headline verbatim', () => {
    // The panel renders: Get {cityName}&apos;s best events weekly
    expect(PANEL).toContain('best events weekly')
    expect(cityNewsletterConsentWording('Geelong')).toContain(
      "Get Geelong's best events weekly",
    )
  })

  it('carries the panel subheading verbatim', () => {
    expect(PANEL).toContain('One email a week, the events worth your time.')
    expect(cityNewsletterConsentWording('Geelong')).toContain(
      'One email a week, the events worth your time.',
    )
  })

  it('claims nothing the panel does not say', () => {
    const wording = cityNewsletterConsentWording('Geelong')
    // Storing a stronger consent than the one shown is the same lie in the
    // other direction.
    expect(wording).not.toMatch(/unsubscribe|offers|partners|third part/i)
  })

  it('is versioned, so the evidence survives a copy change', () => {
    expect(CITY_NEWSLETTER_CONSENT_VERSION).toBeTruthy()
  })

  it('has no banned punctuation', () => {
    const wording = cityNewsletterConsentWording('Geelong')
    expect(wording).not.toMatch(/[—–!]/)
  })
})

describe('the locality the panel sends resolves to a real city', () => {
  it('accepts the display names the panel actually passes', () => {
    // The panel posts `city: cityName`, the human display name.
    expect(resolveCitySlug('Geelong')).toBe('geelong')
    expect(resolveCitySlug('Gold Coast')).toBe('gold-coast')
  })

  it('rejects a locality with no digest instead of storing a dead row', () => {
    expect(resolveCitySlug('Torquay')).toBeNull()
  })
})
