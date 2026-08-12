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
  /** What the buyer's bank actually receives, given the founder's "EL" prefix. */
  const line = (title: string) => {
    const suffix = statementDescriptorSuffix(title)
    return suffix ? `EL* ${suffix}` : 'EL'
  }

  it('passes a short event title through unchanged', () => {
    expect(statementDescriptorSuffix('Basement 45')).toBe('Basement 45')
  })

  it('strips the characters Stripe forbids in a descriptor', () => {
    expect(statementDescriptorSuffix('Rosie\'s <Bar>')).toBe('Rosies Bar')
  })

  it('strips the asterisk, which would forge a second prefix separator', () => {
    expect(statementDescriptorSuffix('Star*Bar')).toBe('StarBar')
  })

  it('strips the backslash Stripe forbids', () => {
    expect(statementDescriptorSuffix('AC\\DC Tribute')).toBe('ACDC Tribute')
  })

  // The whitelist cases. Each of these was verified against the live Stripe
  // TEST API on 2026-08-09; the accented and curly-apostrophe forms are
  // REJECTED by Stripe, which would throw inside paymentIntents.create.
  it('transliterates accents rather than gutting the word', () => {
    expect(statementDescriptorSuffix('Cafe Nino Fiesta')).toBe('Cafe Nino Fiesta')
    expect(statementDescriptorSuffix('Café Niño Fiesta')).toBe('Cafe Nino Fiesta')
  })

  it('removes the curly apostrophe that Stripe rejects outright', () => {
    // Real seeded title. Under a blacklist this reached Stripe and threw.
    expect(statementDescriptorSuffix('A Doll’s House on Stage at The Events Centre')).toBe(
      'A Dolls House'
    )
  })

  it('removes emoji instead of letting Stripe mangle them to question marks', () => {
    expect(statementDescriptorSuffix('Sunset 🎧 Rooftop')).toBe('Sunset Rooftop')
  })

  it('removes non-Latin scripts', () => {
    expect(statementDescriptorSuffix('Ω Δ Σ Night')).toBe('Night')
    expect(statementDescriptorSuffix('東京 Night Market')).toBe('Night Market')
  })

  it('truncates at a word boundary rather than severing a word', () => {
    expect(statementDescriptorSuffix('Electronic Dance Live at Newcastle')).toBe(
      'Electronic Dance'
    )
  })

  it('drops a trailing joining word left behind by truncation', () => {
    // "A Dolls House on" fits the budget but reads like a sentence that ran out
    // of room, so the dangling "on" goes.
    expect(statementDescriptorSuffix('A Dolls House on Stage at The Events Centre')).toBe(
      'A Dolls House'
    )
  })

  it('collapses runaway whitespace', () => {
    expect(statementDescriptorSuffix('  Basement   45  ')).toBe('Basement 45')
  })

  // Regression guards for the truncation rewrite. An earlier word-boundary
  // implementation produced the commented values, none of which identify the
  // event a buyer paid for. Eventbrite hard-clips ("EB *CORGI FESTIVAL 202"
  // cuts 2026 mid-number) and so do we.
  it('hard clips rather than collapsing to a single useless word', () => {
    // was "Women"
    expect(statementDescriptorSuffix('Women in Leadership Breakfast')).toBe('Women in Leadershi')
    // was "Science"
    expect(statementDescriptorSuffix('Science and Discovery Day at Adelaide Botanic Park')).toBe(
      'Science and Discov'
    )
  })

  it('keeps a word that fits the budget exactly', () => {
    // was "Afrobeats": the clip lands exactly on the end of "Amapiano", and the
    // old boundary rule threw the whole second word away.
    expect(
      statementDescriptorSuffix('Afrobeats Amapiano Live at Townsville Entertainment Centre')
    ).toBe('Afrobeats Amapiano')
  })

  it('drops a one or two character fragment but keeps a longer one', () => {
    // "A Dolls House on S" -> fragment "S" is debris, so it goes.
    expect(statementDescriptorSuffix('A Dolls House on Stage at The Events Centre')).toBe(
      'A Dolls House'
    )
    // "Gospel on the Rive" -> "Rive" still carries signal, so it stays.
    expect(statementDescriptorSuffix('Gospel on the River: Brisbane Worship Night')).toBe(
      'Gospel on the Rive'
    )
  })

  it('never tidies a suffix down below the useful floor', () => {
    const suffix = statementDescriptorSuffix('Women in Leadership Breakfast')
    expect(suffix!.length).toBeGreaterThanOrEqual(12)
  })

  it('returns null when nothing printable survives, so the charge keeps the old behaviour', () => {
    expect(statementDescriptorSuffix('')).toBeNull()
    expect(statementDescriptorSuffix(null)).toBeNull()
    expect(statementDescriptorSuffix(undefined)).toBeNull()
    expect(statementDescriptorSuffix('2026')).toBeNull()
    expect(statementDescriptorSuffix('"\'<>')).toBeNull()
    expect(statementDescriptorSuffix('🎧🎉🔥')).toBeNull()
  })

  it('handles a one word title', () => {
    expect(line('Basement45')).toBe('EL* Basement45')
  })

  it('never lets the complete descriptor exceed the 22 characters Stripe allows', () => {
    const titles = [
      'Marketplace Regression Comedy: Free Night at Waterfront Pavilion',
      'Afrobeats Amapiano Live at Townsville Entertainment Centre',
      'Caribbean Dancehall Live at George Brown Botanic Gardens',
      'A Doll’s House on Stage at The Events Centre Caloundra',
      'Basement 45 Warehouse Sessions',
      'Sunset 🎧 Rooftop Session with Café Niño',
    ]
    for (const title of titles) {
      expect(line(title).length).toBeLessThanOrEqual(22)
    }
  })

  it('gives two events from one organiser two different statement lines', () => {
    // The failure the organiser-derived design had: both would have read
    // "EL* Party Pty Ltd" and the buyer could not tell them apart.
    const a = line('Basement 45 Warehouse')
    const b = line('Rooftop Summer Opening')
    expect(a).not.toBe(b)
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
