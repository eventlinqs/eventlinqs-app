import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { timingOf, type TimingNight } from '@/lib/social/timing'
import { remindersFrom } from '@/lib/social/store'

/*
 * CAR T, T2 (the PM's 02:05 of 28 November 2026: "The timing validator must read the post's promotion STAGE from car
 * O's event_promotions ... A reminder may go out on or near the day; a first exposure may not. Never take a night out of
 * a piece to pass a rule."). Red on main, where every night of a roundup was judged ahead of itself, so the Saturday
 * Book Market (9am to 4pm, production's own row, read 04:32 on 28 November) made a 9am weekend roundup "too late" at
 * 7am and was taken out of the piece: now a night whose stage on the post's day is a reminder is judged by the day-of
 * rules on its own day, and a first exposure keeps the rule ahead of itself.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-27T19:00:00Z')
const SLOT = new Date('2026-11-27T22:00:00Z') // Saturday 28 November, 9am Melbourne
const MARKET: TimingNight = { title: 'The Melbourne Book Market', startDate: '2026-11-27T22:00:00Z', endDate: '2026-11-28T05:00:00Z', timezone: 'Australia/Melbourne', status: 'published', isFree: true }
const SHOW: TimingNight = { title: 'Saturday Laughs', startDate: '2026-11-28T09:00:00Z', endDate: '2026-11-28T11:00:00Z', timezone: 'Australia/Melbourne', status: 'published', isFree: false }
const SUNDAY: TimingNight = { title: 'Sunday Laughternoons', startDate: '2026-11-29T04:00:00Z', endDate: '2026-11-29T06:00:00Z', timezone: 'Australia/Melbourne', status: 'published', isFree: false }
const windowOf = (nights: TimingNight[]) => {
  const t = timingOf({ moment: null, nights, preferredAt: SLOT }, NOW)
  if (t.kind !== 'window') throw new Error(`not a window: ${t.kind}`)
  return t
}

describe("each night by its own stage on the post's day", () => {
  it('a first exposure on its own day keeps the rule ahead of itself: the market makes a 9am roundup too late at 7am', () => {
    expect(windowOf([MARKET, SHOW, SUNDAY]).latestAt).toBe('2026-11-27T20:00:00.000Z')
  })
  it('a reminder on its own day is judged by the day-of rules: a long day while two hours remain, its end the expiry', () => {
    const t = windowOf([{ ...MARKET, reminder: true }, SHOW, SUNDAY])
    expect(t.latestAt).toBe('2026-11-28T03:00:00.000Z')
    expect(t.expiresAt).toBe('2026-11-28T05:00:00.000Z')
    expect(t.basis).toContain('a reminder on its own day (its promotion stage): The Melbourne Book Market, a long day, useful while 2 hours remain')
  })
  it('a short reminder on its day still closes two hours before its doors, and a reminder not on its day is judged ahead of itself', () => {
    expect(windowOf([{ ...SHOW, reminder: true }]).latestAt).toBe('2026-11-28T07:00:00.000Z')
    const sunday = windowOf([{ ...SUNDAY, reminder: true }])
    expect(sunday.latestAt).toBe(windowOf([SUNDAY]).latestAt)
  })
  it('with no reminder the window is exactly the one before: the earliest night ahead of itself', () => {
    const t = windowOf([SHOW, SUNDAY])
    expect(t.latestAt).toBe('2026-11-28T07:00:00.000Z')
    expect(t.expiresAt).toBe('2026-11-28T09:00:00.000Z')
    expect(t.basis).not.toContain('a reminder')
  })
})

describe("the stage, from car O's event_promotions", () => {
  it('reads the newest stage due by the day: a follow-up, a final stage or a flagged exception is a reminder; an initial stage, an excluded row or a stage still to come is not', () => {
    const rows = [
      { event_id: 'market', stage: 'initial', due_on: '2026-11-21', exception: false, state: 'posted' },
      { event_id: 'market', stage: 'follow_up', due_on: '2026-11-25', exception: false, state: 'due' },
      { event_id: 'market', stage: 'final', due_on: '2026-11-28', exception: false, state: 'due' },
      { event_id: 'new', stage: 'initial', due_on: '2026-11-28', exception: false, state: 'due' },
      { event_id: 'flagged', stage: 'initial', due_on: '2026-11-28', exception: true, state: 'due' },
      { event_id: 'gone', stage: 'final', due_on: '2026-11-28', exception: false, state: 'excluded' },
      { event_id: 'later', stage: 'initial', due_on: '2026-11-20', exception: false, state: 'posted' },
      { event_id: 'later', stage: 'follow_up', due_on: '2026-12-02', exception: false, state: 'due' },
    ]
    expect([...remindersFrom(rows, '2026-11-28')].sort()).toEqual(['flagged', 'market'])
  })
  it('every path that reads a piece timing reads the stages: intake, scheduling, expiry and publishing, and a failed read is the stricter rule', () => {
    const store = read('src/lib/social/store.ts')
    expect(store).toContain('  const reminders = await remindersOn(db, ids, preferredAt ?? now)\n')
    expect(store).toContain("  const reminders = await remindersOn(db, r.eventIds, opts.stage === 'publish' ? (opts.goesAt ?? now) : new Date(r.preferredAt))\n")
    expect(store).toContain('    const timing = timingOfRows(d.momentKey, pieceNights, at, now, await remindersOn(db, d.rev.eventIds, at))\n')
    expect(store).toContain('    if (error) throw new Error(error.message)\n')
    expect(store).toMatch(/\} catch \(err\) \{\n[^\n]*\n    console\.error\(`\[social\/timing\] the nights' promotion stages could not be read[^\n]*\n    return new Set\(\)\n/)
  })
})
