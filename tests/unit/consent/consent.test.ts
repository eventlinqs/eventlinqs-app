import { describe, it, expect } from 'vitest'
import {
  organiserMarketingConsentWording,
  PLATFORM_UPDATES_CONSENT_WORDING,
  CONSENT_WORDING_VERSION,
  normaliseConsentEmail,
} from '@/lib/consent/wording'
import { buildConsentIndex, isEmailConsented, type ConsentRow } from '@/lib/consent/status'

describe('consent wording (Spam Act)', () => {
  it('names the specific organiser and the channel, with a withdrawal note', () => {
    const w = organiserMarketingConsentWording('Soundwave Collective')
    expect(w).toContain('Soundwave Collective')
    expect(w.toLowerCase()).toContain('email')
    expect(w.toLowerCase()).toContain('unsubscribe')
  })

  it('falls back to a neutral name when the organiser name is blank', () => {
    expect(organiserMarketingConsentWording('   ')).toContain('this organiser')
  })

  it('platform wording is distinct from organiser wording and names EventLinqs', () => {
    expect(PLATFORM_UPDATES_CONSENT_WORDING).toContain('EventLinqs')
    expect(PLATFORM_UPDATES_CONSENT_WORDING).not.toBe(organiserMarketingConsentWording('Acme'))
  })

  it('carries no em or en dashes and no exclamation marks (copy law)', () => {
    for (const s of [organiserMarketingConsentWording('Acme Events'), PLATFORM_UPDATES_CONSENT_WORDING]) {
      expect(s).not.toMatch(/[–—!]/)
    }
  })

  it('has a stable, non-empty wording version for the audit trail', () => {
    expect(CONSENT_WORDING_VERSION).toBeTruthy()
  })

  it('normalises emails case-insensitively and trims', () => {
    expect(normaliseConsentEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com')
  })
})

describe('consent status: withdrawal is honoured, scoping is per-set', () => {
  const rows: ConsentRow[] = [
    { email: 'granted@example.com', status: 'granted', unsubscribe_token: 'tok-granted' },
    { email: 'Withdrawn@Example.com', status: 'withdrawn', unsubscribe_token: 'tok-withdrawn' },
  ]
  const index = buildConsentIndex(rows)

  it('marks a granted attendee as consented', () => {
    expect(isEmailConsented(index, 'granted@example.com')).toBe(true)
    expect(isEmailConsented(index, 'GRANTED@EXAMPLE.COM')).toBe(true) // case-insensitive
  })

  it('honours a withdrawal: a withdrawn attendee is NOT consented', () => {
    expect(isEmailConsented(index, 'withdrawn@example.com')).toBe(false)
  })

  it('treats an email absent from this organiser set as not consented (per-organiser scope)', () => {
    // The index is built from one organiser's rows only, so an email that
    // consented to a DIFFERENT organiser is not in this set and reads false.
    expect(isEmailConsented(index, 'someone-elses-org@example.com')).toBe(false)
  })

  it('exposes the unsubscribe token for a consented attendee', () => {
    expect(index.get('granted@example.com')?.unsubscribeToken).toBe('tok-granted')
  })

  it('last write wins when a row repeats (re-consent after withdrawal)', () => {
    const reconsented = buildConsentIndex([
      { email: 'a@b.com', status: 'withdrawn', unsubscribe_token: 't' },
      { email: 'a@b.com', status: 'granted', unsubscribe_token: 't' },
    ])
    expect(isEmailConsented(reconsented, 'a@b.com')).toBe(true)
  })
})
