import { describe, it, expect } from 'vitest'
import {
  encodeRefCode,
  decodeRefCode,
  buildAttributedUrl,
  readAttributionCookies,
  isReferralSource,
  toAttributionRecord,
  REF_COOKIE,
  REF_SOURCE_COOKIE,
  REF_EVENT_COOKIE,
} from '@/lib/growth/referrals'

describe('ref code encode/decode', () => {
  const samples = [
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '0000000a-0000-0000-0000-00000000000b', // leading-zero stress
  ]

  it('round-trips every uuid back to its canonical form', () => {
    for (const id of samples) {
      const code = encodeRefCode(id)
      expect(code).toBeTruthy()
      expect(decodeRefCode(code)).toBe(id)
    }
  })

  it('produces a short, url-safe, opaque code (no dashes, not the raw uuid)', () => {
    const code = encodeRefCode('a1b2c3d4-e5f6-7890-abcd-ef1234567890')!
    expect(code).toMatch(/^[0-9A-Za-z]+$/)
    expect(code.length).toBeLessThanOrEqual(24)
    expect(code).not.toContain('-')
  })

  it('rejects non-uuid input and garbage codes', () => {
    expect(encodeRefCode('not-a-uuid')).toBeNull()
    expect(encodeRefCode('')).toBeNull()
    expect(decodeRefCode('')).toBeNull()
    expect(decodeRefCode(null)).toBeNull()
    expect(decodeRefCode('has space')).toBeNull()
    expect(decodeRefCode('way-too-long-to-be-a-valid-code-xxxxx')).toBeNull()
  })
})

describe('buildAttributedUrl', () => {
  it('appends ref and source, preserving the path', () => {
    const url = buildAttributedUrl('https://eventlinqs.com/events/afrobeats-night', {
      refCode: 'abc123',
      source: 'share-a-ticket',
    })
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/events/afrobeats-night')
    expect(parsed.searchParams.get('ref')).toBe('abc123')
    expect(parsed.searchParams.get('via')).toBe('share-a-ticket')
  })

  it('omits ref when there is no referrer but still records the source', () => {
    const url = buildAttributedUrl('https://eventlinqs.com/signup?role=organiser', {
      refCode: null,
      source: 'organiser-invite',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('role')).toBe('organiser')
    expect(parsed.searchParams.has('ref')).toBe(false)
    expect(parsed.searchParams.get('via')).toBe('organiser-invite')
  })

  it('returns the input unchanged when it is not a valid absolute url', () => {
    expect(buildAttributedUrl('/relative/path', { source: 'organic' })).toBe('/relative/path')
  })
})

describe('readAttributionCookies', () => {
  const reader = (jar: Record<string, string>) => (name: string) => jar[name]

  it('decodes a share-a-ticket touch with a referrer', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const code = encodeRefCode(id)!
    const captured = readAttributionCookies(
      reader({
        [REF_COOKIE]: code,
        [REF_SOURCE_COOKIE]: 'share-a-ticket',
        [REF_EVENT_COOKIE]: 'afrobeats-night',
      }),
    )
    expect(captured).not.toBeNull()
    expect(captured!.referredBy).toBe(id)
    expect(captured!.source).toBe('share-a-ticket')
    expect(captured!.event).toBe('afrobeats-night')
  })

  it('records a source-only organiser-invite touch with no referrer', () => {
    const captured = readAttributionCookies(reader({ [REF_SOURCE_COOKIE]: 'organiser-invite' }))
    expect(captured).not.toBeNull()
    expect(captured!.referredBy).toBeNull()
    expect(captured!.source).toBe('organiser-invite')
  })

  it('returns null for a purely organic signup (no cookies)', () => {
    expect(readAttributionCookies(reader({}))).toBeNull()
  })

  it('falls back to organic when the source cookie is tampered', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const captured = readAttributionCookies(
      reader({ [REF_COOKIE]: encodeRefCode(id)!, [REF_SOURCE_COOKIE]: 'not-a-real-source' }),
    )
    expect(captured!.source).toBe('organic')
    expect(captured!.referredBy).toBe(id)
  })
})

describe('isReferralSource + toAttributionRecord', () => {
  it('guards the source enum', () => {
    expect(isReferralSource('share-a-ticket')).toBe(true)
    expect(isReferralSource('organiser-invite')).toBe(true)
    expect(isReferralSource('paid-ads')).toBe(false)
    expect(isReferralSource(42)).toBe(false)
  })

  it('stamps an attribution record with the supplied timestamp', () => {
    const record = toAttributionRecord(
      { referredBy: null, refCode: null, source: 'organic', event: null },
      '2026-06-24T00:00:00.000Z',
    )
    expect(record.at).toBe('2026-06-24T00:00:00.000Z')
    expect(record.source).toBe('organic')
  })
})
