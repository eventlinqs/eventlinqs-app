import { describe, expect, it } from 'vitest'
import { inCanaryTenth, canaryOpen } from '@/lib/listings/canary'

/*
 * LAW 19 SECTION 7.4, THE RECORDS CANARY (C:\dev\GROWTH\RELEASE-POLICY-5NOV.md 2.2.4: 'one source, or at most 10% of that
 * source's records, live through one full refresh cycle and at least 6 hours before it widens'). While a source's canary
 * is open, a rule publishes only the records whose stable key falls in one tenth; the rest wait for a person
 * (canary_hold) until it widens. The tenth is a pure function of the record's key, so every run picks the same records.
 */
describe('inCanaryTenth', () => {
  const key = (n: number) => ({ sourceId: 'src-1', pageUrl: `https://venue.example.com.au/show-${n}`, startsAt: '2026-11-21T09:00:00.000Z' })

  it('is the same answer for the same record on every run', () => {
    for (let n = 0; n < 50; n += 1) expect(inCanaryTenth(key(n))).toBe(inCanaryTenth(key(n)))
  })

  it('takes about one record in ten, never none and never all, over many records', () => {
    const picked = Array.from({ length: 1000 }, (_, n) => inCanaryTenth(key(n))).filter(Boolean).length
    expect(picked).toBeGreaterThan(50)
    expect(picked).toBeLessThan(150)
  })
})

describe('canaryOpen', () => {
  it('is open from its opening until a person or the verifier closes it, and closed with no opening', () => {
    expect(canaryOpen({ canary: { openedAt: '2026-11-06T08:00:00Z', release: 'abc1234' } })).toBe(true)
    expect(canaryOpen({ canary: null })).toBe(false)
    expect(canaryOpen({})).toBe(false)
  })
})
