import { describe, it, expect } from 'vitest'
import {
  mergeDigestAudience,
  normaliseAudienceEmail,
  type ConsentAudienceRow,
  type WaitlistAudienceRow,
} from '@/lib/broadcast/digest-audience'
import {
  CONSENT_VERSION,
  DIGEST_COVERING_CONSENT_VERSIONS,
  consentVersionCoversDigest,
  joinConsentText,
} from '@/lib/waitlist/city-waitlist'

/**
 * The waitlist bridge. These tests exist because the failure they guard
 * against is sending marketing mail to a person who never agreed to receive
 * it, or failing to stop when they say stop. Both are unlawful in Australia
 * and neither is visible from a screenshot.
 */

const coversDigest = consentVersionCoversDigest

function consent(email: string, over: Partial<ConsentAudienceRow> = {}): ConsentAudienceRow {
  return { email, unsubscribe_token: `consent-token-${email}`, status: 'granted', ...over }
}

function waitlist(email: string, over: Partial<WaitlistAudienceRow> = {}): WaitlistAudienceRow {
  return {
    email,
    unsubscribe_token: `waitlist-token-${email}`,
    consent_version: CONSENT_VERSION,
    unsubscribed_at: null,
    ...over,
  }
}

describe('the recorded wording binds', () => {
  it('the current join wording names local event emails, so the consent is real', () => {
    const text = joinConsentText('Perth')
    expect(text).toContain('email you when there is something on near you in Perth')
    expect(text).toContain('one click unsubscribes you')
  })

  it('the join wording promises no cadence it cannot honour', () => {
    // Founder ruling 2026-08-23: a weekly promise the platform cannot yet keep
    // burns the subscriber, so no frequency is stated. This is an ABSENCE, so
    // the negative control below proves the assertion can actually fail.
    const text = joinConsentText('Perth')
    expect(text).not.toMatch(/weekly|every week|once a week|daily|monthly/i)
  })

  it('negative control: the cadence assertion fails on wording that states one', () => {
    const withCadence =
      'Get Perth alerts: EventLinqs will send you a weekly email of what is on in Perth.'
    expect(() =>
      expect(withCadence).not.toMatch(/weekly|every week|once a week|daily|monthly/i),
    ).toThrow()
  })

  it('the join wording no longer promises an email when the city opens', () => {
    // Every city is open, so that email would never be sent.
    const text = joinConsentText('Perth')
    expect(text).not.toMatch(/when Perth opens|city opens|opens first/i)
  })

  it('the shipped consent version is one the digest is allowed to draw from', () => {
    expect(DIGEST_COVERING_CONSENT_VERSIONS).toContain(CONSENT_VERSION)
    expect(consentVersionCoversDigest(CONSENT_VERSION)).toBe(true)
  })

  it('v1 signups are excluded: their wording said "Nothing else"', () => {
    expect(consentVersionCoversDigest('v1')).toBe(false)

    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [waitlist('older@example.com', { consent_version: 'v1' })],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([])
  })

  it('a null or unknown consent version is excluded, never assumed', () => {
    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [
        waitlist('a@example.com', { consent_version: null }),
        waitlist('b@example.com', { consent_version: 'v99-from-the-future' }),
      ],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([])
  })
})

describe('the bridge puts waitlist signups in the audience', () => {
  it('a waitlist row alone is a recipient, carrying its own token', () => {
    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [waitlist('promoter@example.com')],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([
      {
        email: 'promoter@example.com',
        unsubscribeToken: 'waitlist-token-promoter@example.com',
        source: 'waitlist',
      },
    ])
  })

  it('both sources are carried, and each keeps its own token', () => {
    const audience = mergeDigestAudience({
      consents: [consent('buyer@example.com')],
      waitlist: [waitlist('promoter@example.com')],
      suppressed: [],
      coversDigest,
    })
    expect(audience.map((r) => r.source).sort()).toEqual(['consent', 'waitlist'])
    expect(audience.find((r) => r.email === 'buyer@example.com')?.unsubscribeToken).toBe(
      'consent-token-buyer@example.com',
    )
    expect(audience.find((r) => r.email === 'promoter@example.com')?.unsubscribeToken).toBe(
      'waitlist-token-promoter@example.com',
    )
  })
})

describe('nobody is emailed twice', () => {
  it('a person on both lists appears once, with the consent token already in their inbox', () => {
    const audience = mergeDigestAudience({
      consents: [consent('both@example.com')],
      waitlist: [waitlist('both@example.com')],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toHaveLength(1)
    expect(audience[0]).toEqual({
      email: 'both@example.com',
      unsubscribeToken: 'consent-token-both@example.com',
      source: 'consent',
    })
  })

  it('addresses match case-insensitively and are normalised on the way out', () => {
    const audience = mergeDigestAudience({
      consents: [consent('Same.Person@Example.COM')],
      waitlist: [waitlist('  same.person@example.com  ')],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toHaveLength(1)
    expect(audience[0].email).toBe('same.person@example.com')
  })

  it('two waitlist rows for the same address collapse to one send', () => {
    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [waitlist('dupe@example.com'), waitlist('DUPE@example.com')],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toHaveLength(1)
  })
})

describe('stop means stop, on both lists', () => {
  it('a withdrawn address is suppressed even when a live waitlist row exists', () => {
    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [waitlist('gone@example.com')],
      suppressed: ['gone@example.com'],
      coversDigest,
    })
    expect(audience).toEqual([])
  })

  it('suppression matches case-insensitively, so casing cannot resurrect anyone', () => {
    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [waitlist('Gone@Example.com')],
      suppressed: ['gone@example.COM'],
      coversDigest,
    })
    expect(audience).toEqual([])
  })

  it('a waitlist row with unsubscribed_at set is out', () => {
    const audience = mergeDigestAudience({
      consents: [],
      waitlist: [waitlist('left@example.com', { unsubscribed_at: '2026-08-01T00:00:00Z' })],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([])
  })

  it('a consent row that is not granted is out', () => {
    const audience = mergeDigestAudience({
      consents: [consent('withdrawn@example.com', { status: 'withdrawn' })],
      waitlist: [],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([])
  })

  it('a withdrawn consent row is not resurrected by the waitlist row beside it', () => {
    const audience = mergeDigestAudience({
      consents: [consent('quit@example.com', { status: 'withdrawn' })],
      waitlist: [waitlist('quit@example.com')],
      suppressed: ['quit@example.com'],
      coversDigest,
    })
    expect(audience).toEqual([])
  })
})

describe('a recipient without a working unsubscribe link is never sent', () => {
  it('a row with no token is dropped rather than emailed', () => {
    const audience = mergeDigestAudience({
      consents: [consent('notoken@example.com', { unsubscribe_token: '' })],
      waitlist: [],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([])
  })

  it('every recipient returned carries a non-empty token', () => {
    const audience = mergeDigestAudience({
      consents: [consent('a@example.com'), consent('b@example.com', { unsubscribe_token: '' })],
      waitlist: [waitlist('c@example.com'), waitlist('d@example.com', { unsubscribe_token: '' })],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toHaveLength(2)
    for (const r of audience) expect(r.unsubscribeToken.length).toBeGreaterThan(0)
  })

  it('an empty address is dropped', () => {
    const audience = mergeDigestAudience({
      consents: [consent('   ')],
      waitlist: [],
      suppressed: [],
      coversDigest,
    })
    expect(audience).toEqual([])
  })
})

describe('normaliseAudienceEmail', () => {
  it('trims and folds case', () => {
    expect(normaliseAudienceEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })
})
