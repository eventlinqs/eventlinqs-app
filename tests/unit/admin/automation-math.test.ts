import { describe, expect, it } from 'vitest'
import { cardState, nextRun, threeNumbers, TARGETS } from '@/lib/admin/automation-math'

/*
 * THE AUTOMATION DASHBOARD'S RULES (Lawal's 13:41 of 15 November 2026): the next run of each schedule, read as UTC as
 * Vercel and GitHub run them; the three test numbers and their targets; the card's one word.
 */
const at = (iso: string) => new Date(iso)

describe('nextRun, in UTC', () => {
  it('every 15 minutes: the next quarter hour', () => {
    expect(nextRun('*/15 * * * *', at('2026-11-15T03:07:30Z'))?.toISOString()).toBe('2026-11-15T03:15:00.000Z')
    expect(nextRun('*/15 * * * *', at('2026-11-15T03:15:00Z'))?.toISOString()).toBe('2026-11-15T03:30:00.000Z')
  })
  it('at 40 past each hour', () => {
    expect(nextRun('40 * * * *', at('2026-11-15T03:41:00Z'))?.toISOString()).toBe('2026-11-15T04:40:00.000Z')
  })
  it('at 25 past every sixth hour', () => {
    expect(nextRun('25 */6 * * *', at('2026-11-15T07:00:00Z'))?.toISOString()).toBe('2026-11-15T12:25:00.000Z')
  })
  it('a list of hours', () => {
    expect(nextRun('0 4,18 * * *', at('2026-11-15T05:00:00Z'))?.toISOString()).toBe('2026-11-15T18:00:00.000Z')
  })
  it('once a day, rolling to the next day', () => {
    expect(nextRun('10 21 * * *', at('2026-11-15T21:10:00Z'))?.toISOString()).toBe('2026-11-16T21:10:00.000Z')
  })
  it('once a week on Wednesday (15 November 2026 is a Sunday)', () => {
    expect(nextRun('0 22 * * 3', at('2026-11-15T00:00:00Z'))?.toISOString()).toBe('2026-11-18T22:00:00.000Z')
  })
  it('anything it cannot read answers null, never a guess', () => {
    expect(nextRun('0 9 * * MON', at('2026-11-15T00:00:00Z'))).toBeNull()
    expect(nextRun('* * *', at('2026-11-15T00:00:00Z'))).toBeNull()
    expect(nextRun('61 * * * *', at('2026-11-15T00:00:00Z'))).toBeNull()
  })
})

describe('the three numbers', () => {
  it('growth is the month on month change of paid tickets, in whole percent', () => {
    expect(threeNumbers({ organisersSelling: 3, paidTicketsThisMonth: 130, paidTicketsLastMonth: 100 }).growthPercent).toBe(30)
  })
  it('with nothing last month there is no percentage to show', () => {
    expect(threeNumbers({ organisersSelling: 0, paidTicketsThisMonth: 0, paidTicketsLastMonth: 0 }).growthPercent).toBeNull()
    expect(threeNumbers({ organisersSelling: 1, paidTicketsThisMonth: 12, paidTicketsLastMonth: 0 }).growthPercent).toBeNull()
  })
  it("the targets are Lawal's: 30 organisers, 5,000 paid tickets, 30 percent, by 15 February 2027", () => {
    expect(TARGETS).toEqual({ organisersSelling: 30, paidTickets: 5000, growthPercent: 30, by: '15 February 2027' })
  })
})

describe("the card's one word", () => {
  it('off when its switch is off, whatever waits', () => {
    expect(cardState({ switchedOn: false, waitingOnPerson: 3 })).toBe('off')
  })
  it('waits when anything waits for a person', () => {
    expect(cardState({ switchedOn: true, waitingOnPerson: 1 })).toBe('waits')
    expect(cardState({ switchedOn: null, waitingOnPerson: 2 })).toBe('waits')
  })
  it('runs when on and nothing waits', () => {
    expect(cardState({ switchedOn: true, waitingOnPerson: 0 })).toBe('runs')
    expect(cardState({ switchedOn: null, waitingOnPerson: 0 })).toBe('runs')
  })
})
