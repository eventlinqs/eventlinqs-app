import { describe, expect, it } from 'vitest'
import { inCanaryTenth, canaryOpen, canarySourcesFor, canaryMayClose } from '@/lib/listings/canary'

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

/* Opening: a deploy that changes a reader opens a canary on every 'read' source that reader serves. A shared reader
   (collect.ts, stated-words.ts) serves all; a page rules file serves the hosts it names. */
describe('canarySourcesFor', () => {
  const sources = [
    { id: 'rla', page_url: 'https://rodlaverarena.com.au/events/', collection: 'read' },
    { id: 'forum', page_url: 'https://www.forummelbourne.com.au/whats-on/', collection: 'read' },
    { id: 'library', page_url: 'https://events.example.vic.gov.au/feeds/ical', collection: 'read' },
    { id: 'asked', page_url: 'https://rodlaverarena.com.au/other/', collection: 'ask' },
  ]
  const rules = { 'src/lib/listings/page-rules-melbourne.ts': "export const forumMelbourne = { host: 'forummelbourne.com.au', read() {} }" }

  it('opens none when no reader changed', () => {
    expect(canarySourcesFor(['src/app/page.tsx', 'docs/x.md'], sources, {})).toEqual([])
  })

  it('opens every read source when a shared reader changed', () => {
    expect(canarySourcesFor(['src/lib/listings/collect.ts'], sources, {})).toEqual(['rla', 'forum', 'library'])
  })

  it('opens only the hosts a changed page rules file names, www or not', () => {
    expect(canarySourcesFor(['src/lib/listings/page-rules-melbourne.ts'], sources, rules)).toEqual(['forum'])
  })
})

/* Closing: at least 6 hours and one full refresh (a successful read after opening), and every published canary night
   the verifier judged PASS, with at least one judged. */
describe('canaryMayClose', () => {
  const openedAt = '2026-11-06T00:00:00Z'
  const later = '2026-11-06T07:00:00Z'
  it('closes after 6 hours, a successful read since opening, and all judged canary nights PASS', () => {
    expect(canaryMayClose({ openedAt, lastSuccessAt: '2026-11-06T06:30:00Z', now: later, verdicts: ['PASS', 'PASS'] })).toBe(true)
  })
  it('stays open before 6 hours, without a read since opening, with nothing judged, or with any FAIL', () => {
    expect(canaryMayClose({ openedAt, lastSuccessAt: '2026-11-06T05:00:00Z', now: '2026-11-06T05:30:00Z', verdicts: ['PASS'] })).toBe(false)
    expect(canaryMayClose({ openedAt, lastSuccessAt: '2026-11-05T23:00:00Z', now: later, verdicts: ['PASS'] })).toBe(false)
    expect(canaryMayClose({ openedAt, lastSuccessAt: '2026-11-06T06:30:00Z', now: later, verdicts: [] })).toBe(false)
    expect(canaryMayClose({ openedAt, lastSuccessAt: '2026-11-06T06:30:00Z', now: later, verdicts: ['PASS', 'FAIL'] })).toBe(false)
  })
})
