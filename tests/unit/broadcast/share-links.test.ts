// Broadcast share-link core proof.
//
// The invariants under test:
//   1. Code generation: strict length-10 base62, high entropy, always valid
//      against the format gate.
//   2. THE ADVERSARIAL GATE: a forged or tampered code never reaches the
//      database (format gate) and an unknown code resolves to null (existence
//      gate), so no attribution row can ever be written for it.
//   3. Conversion integrity: a duplicate conversion (unique-index violation
//      23505) reports success without a second row; other errors report
//      failure.
//   4. View dedupe: a same-day duplicate view for the same visitor is
//      swallowed without an insert.

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

import {
  buildShortUrl,
  generateShareCode,
  isShareChannel,
  isValidShareCode,
  recordShareLinkEvent,
  resolveShareLink,
  visitorHash,
  type BroadcastClient,
} from '@/lib/broadcast/share-links'

describe('share code generation and validation', () => {
  test('generated codes are 10-char base62 and pass the format gate', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode()
      expect(code).toMatch(/^[0-9A-Za-z]{10}$/)
      expect(isValidShareCode(code)).toBe(true)
    }
  })

  test('200 generated codes are unique (entropy sanity)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateShareCode()))
    expect(codes.size).toBe(200)
  })

  test('the format gate rejects every tampered shape', () => {
    expect(isValidShareCode('')).toBe(false)
    expect(isValidShareCode('short')).toBe(false)
    expect(isValidShareCode('elevenchars')).toBe(false)
    expect(isValidShareCode('has space1')).toBe(false)
    expect(isValidShareCode('semi;colon')).toBe(false)
    expect(isValidShareCode("' or 1=1--")).toBe(false)
    expect(isValidShareCode('../../etc0')).toBe(false)
    expect(isValidShareCode(null)).toBe(false)
    expect(isValidShareCode(undefined)).toBe(false)
    expect(isValidShareCode(1234567890)).toBe(false)
  })

  test('buildShortUrl normalises a trailing slash', () => {
    expect(buildShortUrl('https://staging.eventlinqs.com/', 'abcDEF1234')).toBe(
      'https://staging.eventlinqs.com/s/abcDEF1234',
    )
  })

  test('channel guard accepts the locked set only', () => {
    expect(isShareChannel('whatsapp')).toBe(true)
    expect(isShareChannel('qr')).toBe(true)
    expect(isShareChannel('tiktok')).toBe(false)
    expect(isShareChannel('')).toBe(false)
  })

  test('visitorHash is stable, salted, and non-reversible in shape', () => {
    const a = visitorHash('1.2.3.4', 'Mozilla/5.0')
    const b = visitorHash('1.2.3.4', 'Mozilla/5.0')
    const c = visitorHash('5.6.7.8', 'Mozilla/5.0')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toContain('1.2.3.4')
  })
})

function neverQueriedClient(): BroadcastClient {
  return {
    from: () => {
      throw new Error('the database must never be queried for a forged code')
    },
  } as unknown as BroadcastClient
}

function resolvingClient(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as BroadcastClient
}

describe('adversarial gate: forged codes write nothing', () => {
  test('a malformed code short-circuits before any query', async () => {
    const link = await resolveShareLink("'; drop table share_links;--", {
      client: neverQueriedClient(),
    })
    expect(link).toBeNull()
  })

  test('a well-formed but unknown code resolves to null', async () => {
    const link = await resolveShareLink('AAAAAAAAAA', { client: resolvingClient(null) })
    expect(link).toBeNull()
  })
})

describe('conversion and view recording integrity', () => {
  test('a duplicate conversion (23505) is swallowed as success', async () => {
    const client = {
      from: () => ({
        insert: async () => ({ error: { code: '23505', message: 'duplicate' } }),
      }),
    } as unknown as BroadcastClient
    const ok = await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'conversion', orderId: 'order-1' },
      { client },
    )
    expect(ok).toBe(true)
  })

  test('a non-duplicate insert failure reports false', async () => {
    const client = {
      from: () => ({
        insert: async () => ({ error: { code: '42501', message: 'rls' } }),
      }),
    } as unknown as BroadcastClient
    const ok = await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'conversion', orderId: 'order-1' },
      { client },
    )
    expect(ok).toBe(false)
  })

  test('a same-day duplicate view is deduped without an insert', async () => {
    let inserted = false
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: 'existing-view' }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: async () => {
          inserted = true
          return { error: null }
        },
      }),
    } as unknown as BroadcastClient
    const ok = await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'view', visitorHash: 'abc123' },
      { client },
    )
    expect(ok).toBe(true)
    expect(inserted).toBe(false)
  })
})
