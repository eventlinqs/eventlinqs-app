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

const CONFIRM = readFileSync('src/lib/newsletter/confirm.ts', 'utf8')
const WELCOME = readFileSync('src/lib/newsletter/welcome.ts', 'utf8')

describe('the endpoint does what it says: one step (law 50 (a), Lawal, 21 November 2026)', () => {
  it('the click is the record: the route writes the consent itself, with the page, the wording, its version and the IP', () => {
    expect(ROUTE).toContain('recordPlatformDigestConsent')
    expect(ROUTE).toContain('consentText: cityNewsletterConsentWording(cityName)')
    expect(ROUTE).toContain('consentVersion: CITY_NEWSLETTER_CONSENT_VERSION')
    expect(ROUTE).toContain('reference: ip')
    expect(ROUTE).toContain('pageOf(request)')
    // A link from before the change still subscribes its owner on Confirm.
    expect(CONFIRM).toContain('recordPlatformDigestConsent')
  })

  it('never sends a confirm email; the welcome with this week\'s picks goes at once', () => {
    expect(ROUTE).not.toContain('sendConfirmationEmail')
    expect(ROUTE).not.toContain('sealConfirmRequest')
    expect(ROUTE).toContain('sendNewsletterWelcome')
    expect(WELCOME).toContain('buildDigestEmailHtml')
    expect(WELCOME).toContain('oneClickUnsubscribeHeaders')
  })

  it('a filled honeypot is answered as a person would be and recorded as nothing (law 50 (d))', () => {
    const honeypot = ROUTE.indexOf("(parsed.data.website ?? '').trim() !== ''")
    expect(honeypot).toBeGreaterThan(0)
    expect(honeypot).toBeLessThan(ROUTE.indexOf('recordPlatformDigestConsent(admin'))
    expect(PANEL).toContain('name="website"')
    expect(PANEL).toContain('tabIndex={-1}')
    expect(PANEL).toContain('aria-hidden="true"')
  })

  it('a person already on the list is not written twice and gets no second welcome', () => {
    expect(ROUTE).toMatch(/status === 'granted'[\s\S]*welcome: 'already'/)
  })

  it('the press writes into the table the weekly digest actually reads', () => {
    // recordPlatformDigestConsent is the only writer of marketing_consents,
    // which is the only table fetchDigestRecipients reads for consent rows.
    const recorder = readFileSync('src/lib/consent/record.ts', 'utf8')
    expect(recorder).toContain("from('marketing_consents')")
  })

  it('never reports a subscription when nothing was written', () => {
    expect(ROUTE).toMatch(/if \(!recorded\)[\s\S]*not_recorded[\s\S]*status: 500/)
  })

  it('refuses a locality that has no digest, rather than confirming an unreachable row', () => {
    expect(ROUTE).toMatch(/if \(!citySlug\)[\s\S]*status: 400/)
  })

  it('is rate limited per network AND per address, being public, unauthenticated and a sender', () => {
    expect(ROUTE).toContain("POLICIES['newsletter-subscribe']")
    expect(ROUTE).toContain("POLICIES['newsletter-confirm-address']")
    expect(ROUTE).toMatch(/status: 429/)
  })

  it('tells the person what is true for each answer, and never asks them to confirm', () => {
    expect(PANEL).toContain("You're subscribed. This week's picks are on their way to your inbox.")
    expect(PANEL).toContain("You're subscribed. Your weekly guide arrives each Wednesday.")
    expect(PANEL).toContain("You're already on the ${cityName} guide.")
    expect(PANEL).not.toMatch(/Check your inbox|link to confirm/)
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
