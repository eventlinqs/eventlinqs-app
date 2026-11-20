import { describe, expect, it } from 'vitest'
import { nightDates } from '@/lib/social/lifecycle-plan'

/* The look of 05:12 on 21 November 2026 (law 37 (k) and (l)): AMCF's Saturday feed and story read 'Still on today' over
   '📅 Fri 20 Nov', its first day only. Production's own row: 2026-11-20T00:00Z to 2026-11-22T09:00Z, Australia/Melbourne
   (11 am Friday to 8 pm Sunday). */
describe("a night's dates on a post", () => {
  const MEL = 'Australia/Melbourne'
  it('a night over three days reads as its run, so its Saturday post is true', () => {
    expect(nightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL)).toBe('Fri 20 to Sun 22 Nov')
  })
  it('one evening reads as its one day', () => {
    expect(nightDates('2026-11-21T08:30:00Z', '2026-11-21T11:30:00Z', MEL)).toBe('Sat 21 Nov')
    expect(nightDates('2026-11-21T08:30:00Z', null, MEL)).toBe('Sat 21 Nov')
  })
  it("an end recorded as a default midnight never extends a night (law 22 class 2)", () => {
    // 7.30 pm Saturday to midnight: Saturday's alone.
    expect(nightDates('2026-11-21T08:30:00Z', '2026-11-21T13:00:00Z', MEL)).toBe('Sat 21 Nov')
  })
  it('a run across a month names both months', () => {
    expect(nightDates('2026-11-29T00:00:00Z', '2026-12-01T09:00:00Z', MEL)).toBe('Sun 29 Nov to Tue 1 Dec')
  })
})
