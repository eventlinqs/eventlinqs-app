import { describe, expect, it } from 'vitest'
import { feedNightDates, nightDates } from '@/lib/social/lifecycle-plan'

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
  it("a post on a later day of the run starts from that day, never a day already over (the publish gate's past day rule)", () => {
    expect(nightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL, '2026-11-21')).toBe('Sat 21 to Sun 22 Nov')
    expect(nightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL, '2026-11-22')).toBe('Sun 22 Nov')
    // On its first day the run reads whole.
    expect(nightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL, '2026-11-20')).toBe('Fri 20 to Sun 22 Nov')
  })
  it('a run across a month names both months', () => {
    expect(nightDates('2026-11-29T00:00:00Z', '2026-12-01T09:00:00Z', MEL)).toBe('Sun 29 Nov to Tue 1 Dec')
  })
})

/* THE FEED DAY LINE (the PM's verify of 23 November 2026 on piece da22e104, A Moment of Sanity): its feed caption's date line
   read 'Tuesday, Tue 24 Nov, 7pm to 9pm', the weekday twice. A feed post says its weekday and date once, the month in full. */
describe("a feed post's day line", () => {
  const MEL = 'Australia/Melbourne'
  it('one evening: the weekday and the date once, the month in full', () => {
    // 7 pm to 9 pm on Tuesday 24 November, Melbourne.
    expect(feedNightDates('2026-11-24T08:00:00Z', '2026-11-24T10:00:00Z', MEL)).toBe('Tuesday 24 November')
    expect(feedNightDates('2026-11-24T08:00:00Z', null, MEL)).toBe('Tuesday 24 November')
  })
  it('a night past midnight is one night, dated by the day it starts (10pm Friday to 2am Saturday)', () => {
    expect(feedNightDates('2026-11-27T11:00:00Z', '2026-11-27T15:00:00Z', MEL)).toBe('Friday 27 November')
    expect(nightDates('2026-11-27T11:00:00Z', '2026-11-27T15:00:00Z', MEL)).toBe('Fri 27 Nov')
  })

  it('a run reads as its run, from the day the piece posts, and across a month names both months', () => {
    expect(feedNightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL)).toBe('Friday 20 to Sunday 22 November')
    expect(feedNightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL, '2026-11-21')).toBe('Saturday 21 to Sunday 22 November')
    expect(feedNightDates('2026-11-20T00:00:00Z', '2026-11-22T09:00:00Z', MEL, '2026-11-22')).toBe('Sunday 22 November')
    expect(feedNightDates('2026-11-29T00:00:00Z', '2026-12-01T09:00:00Z', MEL)).toBe('Sunday 29 November to Tuesday 1 December')
  })
})
