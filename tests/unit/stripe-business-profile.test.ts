import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildConnectBusinessProfile,
  businessNameDivergence,
  normaliseBusinessName,
  organiserPublicUrl,
  statementDescriptorSuffix,
} from '@/lib/stripe/business-profile'

/**
 * The prefill and divergence logic that stands between an organiser and a wrong
 * name on a stranger's bank statement.
 *
 * The production defect these guard: an organisation registered as
 * "Party Pty Ltd" reached Stripe as "Eventlinqs" with the website
 * "eventlinqs.com" instead of the canonical host, because the platform passed
 * neither and the organiser retyped both from memory.
 */

const ORG = {
  name: 'Party Pty Ltd',
  slug: 'party-pty-ltd',
  email: 'hello@partypty.com.au',
  phone: '+61400000000',
}

describe('organiserPublicUrl', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au'
  })
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = original
  })

  it('resolves through the canonical host and never a literal', () => {
    expect(organiserPublicUrl('party-pty-ltd')).toBe(
      'https://www.eventlinqs.com.au/organisers/party-pty-ltd'
    )
  })

  it('follows the site-url resolver when the host changes, so no literal can go stale', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.example.com'
    expect(organiserPublicUrl('party-pty-ltd')).toBe(
      'https://staging.example.com/organisers/party-pty-ltd'
    )
  })

  it('never emits the non-canonical eventlinqs.com that the defective account carries', () => {
    expect(organiserPublicUrl('party-pty-ltd')).not.toBe('https://eventlinqs.com')
    expect(organiserPublicUrl('party-pty-ltd')).toContain('eventlinqs.com.au')
  })
})

describe('buildConnectBusinessProfile', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au'
  })
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = original
  })

  it('carries the organisation name Stripe would otherwise ask the organiser to retype', () => {
    expect(buildConnectBusinessProfile(ORG, null).name).toBe('Party Pty Ltd')
  })

  it('prefers the organisation email over the signed-in user email', () => {
    expect(buildConnectBusinessProfile(ORG, 'owner@example.com').support_email).toBe(
      'hello@partypty.com.au'
    )
  })

  it('falls back to the signed-in user email when the organisation holds none', () => {
    const profile = buildConnectBusinessProfile({ ...ORG, email: null }, 'owner@example.com')
    expect(profile.support_email).toBe('owner@example.com')
  })

  it('omits support_email entirely rather than sending an empty string', () => {
    const profile = buildConnectBusinessProfile({ ...ORG, email: null }, null)
    expect(profile).not.toHaveProperty('support_email')
  })

  it('sends the phone when held and omits it when not', () => {
    expect(buildConnectBusinessProfile(ORG, null).support_phone).toBe('+61400000000')
    expect(buildConnectBusinessProfile({ ...ORG, phone: null }, null)).not.toHaveProperty(
      'support_phone'
    )
  })

  it('does not set an MCC, which is a per-organiser fact the platform does not hold', () => {
    expect(buildConnectBusinessProfile(ORG, null)).not.toHaveProperty('mcc')
  })

  it('respects the 800 character ceiling Stripe documents for support_email', () => {
    const long = `${'a'.repeat(900)}@example.com`
    const profile = buildConnectBusinessProfile({ ...ORG, email: long }, null)
    expect(profile.support_email!.length).toBeLessThanOrEqual(800)
  })
})

describe('statementDescriptorSuffix', () => {
  it('passes a short organiser name through unchanged', () => {
    expect(statementDescriptorSuffix('Party Pty Ltd')).toBe('Party Pty Ltd')
  })

  it('strips the characters Stripe forbids in a descriptor', () => {
    expect(statementDescriptorSuffix('Rosie\'s <Bar>')).toBe('Rosies Bar')
  })

  it('strips the asterisk, which would forge a second prefix separator', () => {
    // Stripe renders the complete descriptor as "PREFIX* suffix". An asterisk
    // surviving from an organisation name would read as a second separator.
    expect(statementDescriptorSuffix('Star*Bar')).toBe('StarBar')
  })

  it('strips the backslash Stripe forbids', () => {
    expect(statementDescriptorSuffix('AC\\DC Tribute')).toBe('ACDC Tribute')
  })

  it('truncates at a word boundary rather than severing a word', () => {
    expect(statementDescriptorSuffix('Harbour Lights Collective')).toBe('Harbour')
  })

  it('collapses runaway whitespace', () => {
    expect(statementDescriptorSuffix('  Party   Pty  ')).toBe('Party Pty')
  })

  it('returns null when nothing printable survives, so the charge keeps the old behaviour', () => {
    expect(statementDescriptorSuffix('')).toBeNull()
    expect(statementDescriptorSuffix(null)).toBeNull()
    expect(statementDescriptorSuffix(undefined)).toBeNull()
    expect(statementDescriptorSuffix('2026')).toBeNull()
    expect(statementDescriptorSuffix('"\'<>')).toBeNull()
  })

  it('never exceeds the budget left by the platform prefix', () => {
    const suffix = statementDescriptorSuffix('Extraordinarily Long Organisation Name')
    expect(suffix!.length).toBeLessThanOrEqual(14)
  })
})

describe('businessNameDivergence', () => {
  it('flags the exact production defect', () => {
    expect(businessNameDivergence('Party Pty Ltd', 'Eventlinqs')).toEqual({
      status: 'diverged',
      platformName: 'Party Pty Ltd',
      stripeName: 'Eventlinqs',
    })
  })

  it('treats an unset Stripe name as not-yet-onboarded, not as a mismatch', () => {
    expect(businessNameDivergence('Party Pty Ltd', null).status).toBe('not_set')
    expect(businessNameDivergence('Party Pty Ltd', '').status).toBe('not_set')
    expect(businessNameDivergence('Party Pty Ltd', '   ').status).toBe('not_set')
  })

  it('does not cry wolf over punctuation or casing', () => {
    expect(businessNameDivergence('Party Pty Ltd', 'party pty ltd').status).toBe('match')
    expect(businessNameDivergence('Party Pty Ltd', 'Party Pty. Ltd.').status).toBe('match')
    expect(businessNameDivergence('Party Pty Ltd', '  Party  Pty  Ltd ').status).toBe('match')
  })

  it('still reports a genuinely different legal name', () => {
    expect(businessNameDivergence('Party Pty Ltd', 'Party').status).toBe('diverged')
  })
})

describe('normaliseBusinessName', () => {
  it('casefolds and drops punctuation without swallowing real words', () => {
    expect(normaliseBusinessName('Party Pty. Ltd.')).toBe('party pty ltd')
    expect(normaliseBusinessName('Rosie&Co')).toBe('rosie co')
  })
})
