import { describe, expect, it } from 'vitest'
import { rateRose, trendRow, weeklyProof, type TrendRow } from '@/lib/listings/accuracy-trend'

/*
 * THE SWEEP'S TREND (learning part 1 of the CONTROLLER's 08:42 of 7 November 2026: 'each run's rate per field and per source
 * appended to one trend file (date, facts checked, wrong, unreadable, rate); a rate that rises over the day before is a
 * CONTROLLER line'). One row per run from the sweep's own facts; a rise is judged against the last row of an EARLIER day.
 */
const fact = (field: string, host: string, ok: boolean) => ({ field, host, ok })
const facts = [fact('start', 'a.com', true), fact('start', 'a.com', true), fact('price', 'b.com', false), fact('price', 'b.com', true)]

describe('the trend row', () => {
  it('carries the date, the counts, the rate overall, per field and per source', () => {
    const row = trendRow('2026-11-07T05:26:00Z', facts, 94)
    expect(row).toMatchObject({ date: '2026-11-07', facts: 4, wrong: 1, unreadable: 94, rate: 25 })
    expect(row.byField).toEqual({ start: { facts: 2, wrong: 0 }, price: { facts: 2, wrong: 1 } })
    expect(row.bySource['b.com']).toEqual({ facts: 2, wrong: 1 })
  })
})

describe('the weekly proof for Lawal (learning part 5)', () => {
  const r = (date: string, rate: number, wrong: number, facts: number, bySource: TrendRow['bySource'], unreadable = 94) =>
    ({ at: `${date}T00:00:00Z`, date, rate, wrong, facts, unreadable, byField: {}, bySource }) as TrendRow
  it('says this week against last, the sources improved and those still unreadable, in plain words', () => {
    const rows = [
      r('2026-11-03', 2.5, 50, 2000, { 'a.com': { facts: 100, wrong: 10 }, 'b.com': { facts: 100, wrong: 0 } }),
      r('2026-11-09', 1.0, 20, 2000, { 'a.com': { facts: 100, wrong: 2 }, 'b.com': { facts: 100, wrong: 0 } }, 60),
    ]
    const text = weeklyProof(rows, '2026-11-10')
    expect(text).toContain('This week the engine was wrong on 1% of the facts it checked, down from 2.5% the week before.')
    expect(text).toContain('a.com: 10% wrong last week, 2% this week')
    expect(text).toContain('60 listings could not be read against their source')
    expect(text).not.toMatch(/[–—]/)
    // It says only what the trend measured: never that a wrong or unreadable listing is held, a fact of the hold, not of it.
    expect(text).not.toMatch(/held|never shown/i)
  })
  it('says plainly when there is no week before to compare with', () => {
    expect(weeklyProof([r('2026-11-09', 1.745, 45, 2579, {})], '2026-11-10')).toContain('no week before it to compare with')
  })
})

describe('a rise over the day before', () => {
  const row = (date: string, rate: number) => ({ date, rate }) as TrendRow
  it('is a rise only against an earlier day, never a run the same day', () => {
    expect(rateRose([row('2026-11-06', 1.748)], row('2026-11-07', 1.9))).toBe(true)
    expect(rateRose([row('2026-11-06', 1.748)], row('2026-11-07', 1.745))).toBe(false)
    expect(rateRose([row('2026-11-07', 1.0)], row('2026-11-07', 1.9))).toBe(false)
    expect(rateRose([], row('2026-11-07', 1.9))).toBe(false)
  })
  it('the day before is its LAST run', () => {
    expect(rateRose([row('2026-11-06', 3), row('2026-11-06', 1)], row('2026-11-07', 2))).toBe(true)
  })
})
