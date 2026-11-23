import { describe, expect, it } from 'vitest'
import { addedSlot, dayStart, planMoments, STARTING_CALENDAR, type CadenceRule, type SchedulePiece } from '@/lib/social/cadence'

/*
 * THE WEEK'S PLAN FITS THE WEEK (the PM's 09:10 of 16 November 2026: Lawal's switch-on moves to the evening, and the
 * week's posts are not lost or doubled). Read before the fix (C:\dev\EVIDENCE\EL-16NOV\out14-train\
 * switch-on-deadlines.txt): under the four band calendar and approval order, two of out-14's fourteen pieces would have
 * published; a piece is held whole once any of its nights has ended, so each one must go before its earliest night ends.
 * The regression case below is out-14's own week, each piece's latest useful time the end of its earliest night as production held
 * them at 09:16 that day (read only).
 */
const rule = (over: Partial<CadenceRule> = {}): CadenceRule => ({ version: 1, gapHours: 12, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: new Date('2026-10-27T00:00:00Z'), ...over })
const RULES = { feed: rule({ slots: STARTING_CALENDAR.feed }), story: rule({ gapHours: 2, slots: STARTING_CALENDAR.story }) }
const NONE = { feed: [], story: [] }
// Melbourne keeps daylight time (UTC+11) all that week.
const mel = (local: string) => new Date(`${local}:00+11:00`)

// Out-14, in the plan's own order (week ahead, the reel, weekend, Fri and Sat, venue, category, coming up), approved at
// the evening switch-on, the first scheduler run at 7:40 pm on Monday 16 November.
const APPROVED = mel('2026-11-16T19:00')
const RUN = mel('2026-11-16T19:40')
const piece = (n: number, format: 'feed' | 'story', latestUseful: string, notBefore?: string): SchedulePiece => ({
  id: String(n),
  format,
  approvedAt: APPROVED,
  latestUseful: mel(latestUseful),
  notBefore: notBefore ? mel(notBefore) : null,
})
const OUT14: SchedulePiece[] = [
  piece(1, 'feed', '2026-11-17T00:00'), // Melbourne, the week ahead
  piece(6, 'feed', '2026-11-20T00:00'), // Geelong, the week ahead
  piece(10, 'feed', '2026-11-18T00:00'), // Bendigo, the week ahead
  piece(12, 'feed', '2026-11-20T00:00'), // Ballarat, the week ahead
  piece(13, 'story', '2026-11-20T00:00', '2026-11-19T00:00'), // Geelong, the reel: its first night Thursday 6:30 pm
  piece(2, 'feed', '2026-11-20T22:00'), // Melbourne, the weekend
  piece(7, 'feed', '2026-11-20T18:00'), // Geelong, the weekend
  piece(11, 'feed', '2026-11-21T15:00'), // Bendigo, the weekend
  piece(3, 'feed', '2026-11-20T21:30'), // Melbourne, Friday and Saturday
  piece(8, 'feed', '2026-11-20T16:00'), // Geelong, Friday and Saturday
  piece(14, 'feed', '2026-11-17T00:00'), // Melbourne, the venue spotlight (a Monday 7:30 pm night)
  piece(5, 'feed', '2026-11-17T00:00'), // Melbourne, the category spotlight (a Monday 7:30 pm night)
  piece(4, 'feed', '2026-11-25T00:00'), // Melbourne, coming up
  piece(9, 'feed', '2026-11-26T00:00'), // Geelong, coming up
]

describe("the week's plan", () => {
  it("out-14's week from the evening switch-on: all fourteen placed, each before its earliest night ends", () => {
    // Twelve took a band, as before; the two the bands could not fit before their nights take an added slot (Lawal,
    // 22 November 2026, 01:31: the plan "adds slots when the day needs more, never drops an event's due moment").
    const plan = planMoments(OUT14, RULES, NONE, RUN)
    expect(plan.moments.size).toBe(14)
    expect(plan.late).toEqual([])
    for (const p of OUT14) {
      const at = plan.moments.get(p.id)
      if (at) expect(at.getTime()).toBeLessThanOrEqual((p.latestUseful as Date).getTime())
    }
    expect(plan.moments.get('1')).toEqual(mel('2026-11-16T21:00'))
    expect(plan.moments.get('10')).toEqual(mel('2026-11-17T09:00'))
    expect(plan.moments.get('13')).toEqual(mel('2026-11-19T18:00'))
    expect(plan.moments.get('8')).toEqual(mel('2026-11-18T21:00'))
    expect(plan.moments.get('9')).toEqual(mel('2026-11-21T21:00'))
  })

  it('the two Melbourne spotlights with a Monday night take added slots before their night, never late, never together', () => {
    const plan = planMoments(OUT14, RULES, NONE, RUN)
    const a = plan.moments.get('14') as Date
    const b = plan.moments.get('5') as Date
    for (const at of [a, b]) {
      expect(at.getTime()).toBeGreaterThanOrEqual(RUN.getTime())
      expect(at.getTime()).toBeLessThanOrEqual(mel('2026-11-17T00:00').getTime())
    }
    expect(Math.abs(a.getTime() - b.getTime())).toBeGreaterThanOrEqual(15 * 60_000)
  })

  it('a piece is late only when its own window holds no minute at all', () => {
    const gone = { id: 'g', format: 'feed' as const, approvedAt: APPROVED, latestUseful: mel('2026-11-16T19:00') }
    const plan = planMoments([gone], RULES, NONE, RUN)
    expect(plan.late.map((l) => l.id)).toEqual(['g'])
    expect(addedSlot([], RUN, mel('2026-11-16T19:00'), null)).toBeNull()
  })

  it('an added slot never shares a minute: a full window narrows the spacing before it ever drops a piece', () => {
    const from = mel('2026-11-17T10:00')
    const latestUseful = mel('2026-11-17T10:30')
    const busy: number[] = []
    for (let i = 0; i < 31; i += 1) {
      const at = addedSlot(busy, from, latestUseful, null)
      expect(at).not.toBeNull()
      busy.push((at as Date).getTime())
    }
    expect(new Set(busy).size).toBe(31)
    expect(addedSlot(busy, from, latestUseful, null)).toBeNull()
  })

  it('the bands keep the 12 hour floor; only an added slot, made because the day needs it, comes closer', () => {
    const plan = planMoments(OUT14, RULES, NONE, RUN)
    const added = new Set(['14', '5'])
    const banded = OUT14.filter((p) => p.format === 'feed' && !added.has(p.id)).map((p) => (plan.moments.get(p.id) as Date).getTime()).sort((a, b) => a - b)
    for (let i = 1; i < banded.length; i += 1) expect(banded[i] - banded[i - 1]).toBeGreaterThanOrEqual(12 * 3_600_000)
    const all = OUT14.filter((p) => p.format === 'feed').map((p) => (plan.moments.get(p.id) as Date).getTime()).sort((a, b) => a - b)
    for (let i = 1; i < all.length; i += 1) expect(all[i] - all[i - 1]).toBeGreaterThanOrEqual(60_000)
  })

  it('a schedule still waiting from an earlier approval is taken: a piece approved an hour later goes a full gap after it', () => {
    const waiting = { feed: [mel('2026-11-16T21:00')], story: [] }
    const later = { id: 'x', format: 'feed' as const, approvedAt: mel('2026-11-16T20:00') }
    const plan = planMoments([later], RULES, waiting, mel('2026-11-16T20:40'))
    expect(plan.moments.get('x')).toEqual(mel('2026-11-17T09:00'))
  })

  it('the last post that went is taken too: the next goes a full gap after it, inside the band then open', () => {
    const plan = planMoments([{ id: 'y', format: 'feed', approvedAt: mel('2026-11-17T08:00') }], RULES, { feed: [mel('2026-11-16T21:40')], story: [] }, mel('2026-11-17T08:40'))
    expect(plan.moments.get('y')).toEqual(mel('2026-11-17T09:40'))
  })

  it('soonest latest useful time first, the order given on a tie', () => {
    const a = { id: 'a', format: 'feed' as const, approvedAt: APPROVED, latestUseful: mel('2026-11-21T00:00') }
    const b = { id: 'b', format: 'feed' as const, approvedAt: APPROVED, latestUseful: mel('2026-11-17T12:00') }
    const c = { id: 'c', format: 'feed' as const, approvedAt: APPROVED }
    const plan = planMoments([c, a, b], RULES, NONE, RUN)
    expect(plan.moments.get('b')).toEqual(mel('2026-11-16T21:00'))
    expect(plan.moments.get('a')).toEqual(mel('2026-11-17T09:00'))
    expect(plan.moments.get('c')).toEqual(mel('2026-11-17T21:00'))
  })

  it("a story waits for the day of its first night: midnight on Melbourne's clock", () => {
    expect(dayStart(mel('2026-11-19T18:30'))).toEqual(mel('2026-11-19T00:00'))
    expect(dayStart(mel('2026-11-19T00:00'))).toEqual(mel('2026-11-19T00:00'))
  })
})
