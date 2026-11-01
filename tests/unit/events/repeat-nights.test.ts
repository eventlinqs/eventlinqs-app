import { describe, expect, it } from 'vitest'
import { planRepeatNights, repeatRuleOf, REPEAT_NIGHTS_AHEAD } from '@/lib/events/repeat-nights'

/*
 * A REPEAT MAKES ITS NIGHTS (V3 item 6): the form's repeat choice gives the next seven dates after the night itself, at
 * the same local time across a Daylight Saving change, never a date that already has its night.
 */
const NOW = new Date('2026-11-01T00:00:00Z')
const MELB = 'Australia/Melbourne'

describe('repeatRuleOf', () => {
  it('reads the choices the form offers and the ones it stored before', () => {
    expect(repeatRuleOf('weekly', '2026-11-06')).toEqual({ rule: 'weekly' })
    expect(repeatRuleOf('FREQ=WEEKLY', '2026-11-06')).toEqual({ rule: 'weekly' })
    expect(repeatRuleOf('fortnightly', '2026-11-06')).toEqual({ rule: 'fortnightly' })
    // 6 November 2026 is the first Friday of its month, 27 November the fourth, 29 January 2027 the fifth.
    expect(repeatRuleOf('monthly', '2026-11-06')).toEqual({ rule: 'monthly-1' })
    expect(repeatRuleOf('FREQ=MONTHLY', '2026-11-27')).toEqual({ rule: 'monthly-4' })
    expect(repeatRuleOf('monthly', '2027-01-29')).toEqual({ rule: 'monthly-last' })
  })

  it('says why a night cannot repeat daily or with no choice', () => {
    expect(repeatRuleOf('FREQ=DAILY', '2026-11-06')).toHaveProperty('problem')
    expect(repeatRuleOf(null, '2026-11-06')).toHaveProperty('problem')
  })
})

describe('planRepeatNights', () => {
  it('gives the next seven weeks after the night, at 7pm local across the April change', () => {
    // Friday 26 March 2027, 7pm to 11pm in Melbourne (AEDT, UTC+11).
    const plan = planRepeatNights(
      { start_date: '2027-03-26T08:00:00.000Z', end_date: '2027-03-26T12:00:00.000Z', timezone: MELB, recurrence_rule: 'weekly' },
      [],
      NOW,
    )
    if (!('nights' in plan)) throw new Error(plan.problem)
    expect(plan.nights).toHaveLength(REPEAT_NIGHTS_AHEAD)
    expect(plan.nights[0]).toEqual({ date: '2027-04-02', startIso: '2027-04-02T08:00:00.000Z', endIso: '2027-04-02T12:00:00.000Z' })
    // After the first Sunday of April it is AEST, UTC+10: still 7pm at the door, an hour later in UTC.
    expect(plan.nights[1]).toEqual({ date: '2027-04-09', startIso: '2027-04-09T09:00:00.000Z', endIso: '2027-04-09T13:00:00.000Z' })
  })

  it('runs past midnight when the night does, and never makes a date twice', () => {
    // Saturday 7 November 2026, 9pm to 3am (AEDT).
    const plan = planRepeatNights(
      { start_date: '2026-11-07T10:00:00.000Z', end_date: '2026-11-07T16:00:00.000Z', timezone: MELB, recurrence_rule: 'fortnightly' },
      ['2026-11-21'],
      NOW,
    )
    if (!('nights' in plan)) throw new Error(plan.problem)
    expect(plan.nights.map((n) => n.date)).toEqual(['2026-12-05', '2026-12-19', '2027-01-02', '2027-01-16', '2027-01-30', '2027-02-13'])
    expect(plan.nights[0]).toEqual({ date: '2026-12-05', startIso: '2026-12-05T10:00:00.000Z', endIso: '2026-12-05T16:00:00.000Z' })
  })

  it('a night longer than a day does not repeat', () => {
    const plan = planRepeatNights(
      { start_date: '2026-11-07T00:00:00.000Z', end_date: '2026-11-08T12:00:00.000Z', timezone: MELB, recurrence_rule: 'weekly' },
      [],
      NOW,
    )
    expect(plan).toHaveProperty('problem')
  })
})
