import { describe, expect, test } from 'vitest'
import { scrubString, scrubValue, _internal } from '@/lib/observability/pii-scrub'

const { SCRUB } = _internal

describe('scrubString', () => {
  test('returns non-strings unchanged', () => {
    expect(scrubString('')).toBe('')
    // @ts-expect-error - exercising defensive guard
    expect(scrubString(null)).toBe(null)
    // @ts-expect-error - exercising defensive guard
    expect(scrubString(undefined)).toBe(undefined)
  })

  test('redacts plain email addresses', () => {
    expect(scrubString('contact lawal@eventlinqs.com about the bug')).toBe(
      `contact ${SCRUB} about the bug`
    )
  })

  test('redacts emails with plus-tags and dots', () => {
    expect(scrubString('lawal.adams+test@eventlinqs.co.uk failed')).toBe(`${SCRUB} failed`)
  })

  test('redacts AU mobile numbers', () => {
    expect(scrubString('called 0412 345 678 to confirm')).toBe(`called ${SCRUB} to confirm`)
  })

  test('redacts E.164 international numbers', () => {
    expect(scrubString('phone +61 412 345 678')).toBe(`phone ${SCRUB}`)
  })

  test('redacts Stripe customer ids while keeping the prefix', () => {
    expect(scrubString('charge failed for cus_NffrFeUfNV2Hib')).toBe(
      `charge failed for cus_${SCRUB}`
    )
  })

  test('redacts multiple Stripe id prefixes', () => {
    const out = scrubString('pi_3O1abc, ch_3O1xyz, sub_NffrFeUfNV2Hib')
    expect(out).toContain(`pi_${SCRUB}`)
    expect(out).toContain(`ch_${SCRUB}`)
    expect(out).toContain(`sub_${SCRUB}`)
  })

  test('redacts JWT-shaped tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    expect(scrubString(`Authorization Bearer ${jwt}`)).toContain(SCRUB)
    expect(scrubString(`Authorization Bearer ${jwt}`)).not.toContain('eyJ')
  })

  test('redacts Bearer tokens regardless of payload shape', () => {
    expect(scrubString('Authorization: Bearer abc123-def456_ghi789')).toContain(
      `Bearer ${SCRUB}`
    )
  })

  test('redacts credit-card-shaped numeric blocks', () => {
    expect(scrubString('card 4242 4242 4242 4242 declined')).toBe(`card ${SCRUB} declined`)
    expect(scrubString('card 4242-4242-4242-4242 declined')).toBe(`card ${SCRUB} declined`)
  })

  test('partially redacts UUIDs (keeps first 8 chars)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const out = scrubString(`event ${uuid} failed`)
    expect(out).toBe(`event 550e8400-${SCRUB} failed`)
  })

  test('handles a worst-case stack trace with multiple PII types', () => {
    const input =
      'Error processing cus_AB12CD for lawal@eventlinqs.com (event 550e8400-e29b-41d4-a716-446655440000) Authorization: Bearer xyz123'
    const out = scrubString(input)
    expect(out).not.toContain('lawal@eventlinqs.com')
    expect(out).not.toContain('AB12CD')
    expect(out).not.toContain('e29b-41d4')
    expect(out).not.toContain('Bearer xyz123')
    expect(out).toContain('cus_')
    expect(out).toContain('550e8400-')
  })
})

describe('scrubValue', () => {
  test('passes through primitives that are not strings', () => {
    expect(scrubValue(42)).toBe(42)
    expect(scrubValue(true)).toBe(true)
    expect(scrubValue(null)).toBe(null)
    expect(scrubValue(undefined)).toBe(undefined)
  })

  test('scrubs strings inside arrays', () => {
    const out = scrubValue(['ok', 'lawal@eventlinqs.com'])
    expect(out).toEqual(['ok', SCRUB])
  })

  test('scrubs strings inside nested objects', () => {
    const out = scrubValue({
      message: 'failure for lawal@eventlinqs.com',
      meta: { customer: 'cus_NffrFeUfNV2Hib' },
    })
    expect(out).toEqual({
      message: `failure for ${SCRUB}`,
      meta: { customer: `cus_${SCRUB}` },
    })
  })

  test('drops Authorization, Cookie, and stripe-signature headers entirely', () => {
    const out = scrubValue({
      headers: {
        authorization: 'Bearer leaks-through-unredacted-otherwise',
        Cookie: 'sb-access-token=eyJabc',
        'Stripe-Signature': 't=1234,v1=abcdef',
        'X-Custom': 'safe',
      },
    }) as { headers: Record<string, string> }
    expect(out.headers.authorization).toBe(SCRUB)
    expect(out.headers.Cookie).toBe(SCRUB)
    expect(out.headers['Stripe-Signature']).toBe(SCRUB)
    expect(out.headers['X-Custom']).toBe('safe')
  })

  test('caps recursion depth to prevent CPU blow-up', () => {
    type Recursive = { child?: Recursive; leaf?: string }
    const root: Recursive = {}
    let cur = root
    for (let i = 0; i < 10; i++) {
      cur.child = {}
      cur = cur.child
    }
    cur.leaf = 'lawal@eventlinqs.com'
    const out = JSON.stringify(scrubValue(root))
    expect(out).toContain('depth-limited')
  })
})
