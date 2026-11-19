import { describe, expect, it } from 'vitest'
import { lastDays, newestOf, provingOf, recoveredAfter } from '@/lib/admin/engine-math'

/*
 * THE ENGINE PAGE'S RULES (the operating model's amendment 1, A4 and A5; the PM's 01:39 of 19 November 2026, item 3):
 * an automation is permanent only after three days in a row on its own schedule with no human prompt, read from its own
 * records; until then it is "proving, day N of 3".
 */
const NOW = new Date('2026-11-18T16:30:00Z') // 3.30 am on Thursday 19 November in Melbourne

describe('A5, proving and permanent', () => {
  it('three days in a row before today, today not yet run: permanent', () => {
    expect(provingOf([{ day: '19', ran: false }, { day: '18', ran: true }, { day: '17', ran: true }, { day: '16', ran: true }])).toEqual({ permanent: true, day: 3, line: 'Running permanently: 3 days in a row on its own schedule' })
  })
  it('today counts once it has run', () => {
    expect(provingOf([{ day: '19', ran: true }, { day: '18', ran: true }, { day: '17', ran: false }, { day: '16', ran: true }]).line).toBe('Proving, day 2 of 3')
  })
  it('a gap starts the count again', () => {
    expect(provingOf([{ day: '19', ran: false }, { day: '18', ran: false }, { day: '17', ran: true }, { day: '16', ran: true }]).line).toBe('Proving, day 0 of 3')
  })
  it('nothing read is day 0', () => {
    expect(provingOf([]).line).toBe('Proving, day 0 of 3')
  })
})

describe("the days read, on Melbourne's calendar", () => {
  it('today first, each day from its own midnight, through a daylight saving change', () => {
    const days = lastDays(NOW, 4)
    expect(days.map((d) => d.day)).toEqual(['2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16'])
    expect(days[0].from).toBe('2026-11-18T13:00:00.000Z')
    expect(days[1].to).toBe(days[0].from)
    // Sunday 5 April 2026 has 25 hours in Melbourne (daylight saving ends): each day still begins at its own midnight.
    const april = lastDays(new Date('2026-04-06T02:00:00Z'), 3)
    expect(april.map((d) => d.day)).toEqual(['2026-04-06', '2026-04-05', '2026-04-04'])
    expect(april[1].from).toBe('2026-04-04T13:00:00.000Z')
    expect(april[0].from).toBe('2026-04-05T14:00:00.000Z')
  })
})

describe('a failure and its recovery', () => {
  it('recovered only by a good run after it; no failure, nothing to say', () => {
    expect(recoveredAfter('2026-11-18T10:00:00Z', '2026-11-18T11:00:00Z')).toBe(true)
    expect(recoveredAfter('2026-11-18T10:00:00Z', '2026-11-18T09:00:00Z')).toBe(false)
    expect(recoveredAfter('2026-11-18T10:00:00Z', null)).toBe(false)
    expect(recoveredAfter(null, '2026-11-18T09:00:00Z')).toBeNull()
  })
  it('the newest of several instants', () => {
    expect(newestOf(null, '2026-11-18T10:00:00Z', undefined, '2026-11-18T12:00:00Z')).toBe('2026-11-18T12:00:00Z')
    expect(newestOf(null, undefined)).toBeNull()
  })
})
