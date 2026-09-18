// THE CONSENT LEDGER RENDERS DATES IN THE PLATFORM ZONE, NOT IN UTC.
//
// THE DEFECT, MEASURED ON 19 SEPTEMBER 2026. `readableDate` built its answer
// from `getUTCDate()`, `getUTCMonth()` and `getUTCFullYear()`. Australian
// eastern time is UTC+10 (AEST) or UTC+11 (AEDT), so every record made between
// 10:00 and midnight local rendered a day early. A one-click unsubscribe
// pressed at 07:20 on 19 September Melbourne time was shown on the person's own
// preferences page as "On 18 September 2026 ... this address withdrew that
// agreement". The screenshot is in C:\dev\EVIDENCE\LB-ONECLICK\drive\.
//
// WHY IT MATTERS MORE HERE THAN ALMOST ANYWHERE. The closing line of that page
// is "Records are kept as evidence of what you were shown and when". A date
// that is out by a day is not cosmetic on a surface whose whole claim is
// evidence, and the surface exists to answer a complaint.
//
// The platform's own rule, at src/lib/dates/event-time.ts, is that a date with
// no event behind it takes the platform zone. A consent event has no event
// behind it.

import { describe, expect, it } from 'vitest'

import { readableDate, consentEventSentence } from '@/lib/consent/sentences'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/** The answer computed independently, zone-pinned, so the test is not circular. */
function sydneyDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: PLATFORM_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

/** What the old implementation would have said. Kept so the gap is assertable. */
function utcDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

describe('a date a person reads on their own consent record', () => {
  it('shows the day it happened in Melbourne, not the day it was in London', () => {
    // The exact instant the LB-ONECLICK drive pressed one-click: 07:20 on
    // 19 September 2026 AEST.
    const iso = '2026-09-18T21:20:02Z'
    expect(readableDate(iso)).toBe('19 September 2026')
    expect(utcDate(iso)).toBe('18 September 2026')
  })

  it('is right through daylight saving, when the offset is UTC+11', () => {
    // 01:30 on 16 March 2026 AEDT. A zone-naive fix that hardcoded +10 would
    // still be wrong here, which is why the platform zone is named rather than
    // an offset applied.
    const iso = '2026-03-15T14:30:00Z'
    expect(readableDate(iso)).toBe('16 March 2026')
    expect(utcDate(iso)).toBe('15 March 2026')
  })

  it('rolls the YEAR over when the instant is late on 31 December in UTC', () => {
    const iso = '2026-12-31T13:05:00Z'
    expect(readableDate(iso)).toBe('1 January 2027')
    expect(utcDate(iso)).toBe('31 December 2026')
  })

  it('does not move a date that was already the same in both zones', () => {
    // The fix must not be a blanket shift: a morning-UTC instant is the same
    // calendar day either way, and this is what would catch an off-by-one
    // "correction" applied unconditionally.
    const iso = '2026-09-19T01:00:00Z'
    expect(readableDate(iso)).toBe('19 September 2026')
    expect(readableDate(iso)).toBe(utcDate(iso))
  })

  it('agrees with an independently computed platform-zone date across a full day', () => {
    // Every hour of one day, so a partial fix cannot pass by getting the one
    // case in the test right.
    for (let hour = 0; hour < 24; hour += 1) {
      const iso = `2026-09-${18}T${String(hour).padStart(2, '0')}:30:00Z`
      expect(readableDate(iso)).toBe(sydneyDate(iso))
    }
  })

  it('still answers a malformed date in words rather than echoing the input', () => {
    // The shared formatter answers a bad date with the raw string, which is
    // right for an admin table and wrong inside a sentence a member of the
    // public reads.
    expect(readableDate('not-a-date')).toBe('an unrecorded date')
    expect(readableDate('')).toBe('an unrecorded date')
  })

  it('carries the corrected date into the sentence the person actually reads', () => {
    // readableDate being right is worth nothing if the sentence builds its own.
    const sentence = consentEventSentence({
      purpose: 'platform_local_digest',
      decision: 'withdrawn',
      channelScope: 'both',
      wordingVersion: 'v1',
      captureSurface: 'one-click-unsubscribe',
      citySlug: 'geelong',
      occurredAt: '2026-09-18T21:20:02Z',
    })
    expect(sentence).toContain('19 September 2026')
    expect(sentence).not.toContain('18 September 2026')
  })
})

describe('the zone is named, not hand-rolled', () => {
  it('the module holds no month array and no date getter of its own', async () => {
    // The structural half. The behaviour above can be satisfied for one set of
    // inputs by a cleverer piece of arithmetic; this refuses the whole shape,
    // because the shape is what went wrong.
    //
    // READ AS CODE, NOT AS TEXT. The first version of this assertion failed on
    // the POST-MORTEM directly above readableDate, which names the three UTC
    // getters it exists to record the removal of. scripts/lib/js-source.mjs was
    // written after a guard did exactly this once before, and its header says
    // why: a check that cannot tell a post-mortem from the defect is a check
    // that punishes writing the post-mortem.
    const { readFileSync } = await import('node:fs')
    const { stripComments } = await import('../../../scripts/lib/js-source.mjs')
    const code = stripComments(readFileSync('src/lib/consent/sentences.ts', 'utf8'))
    expect(code).not.toMatch(/getUTC(Date|Month|FullYear)\(/)
    expect(code).not.toMatch(/const MONTHS\s*=/)
    expect(code).toContain('formatPlatformDateLong')
  })
})
