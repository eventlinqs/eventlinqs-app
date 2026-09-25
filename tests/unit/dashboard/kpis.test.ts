/**
 * THE ORGANISER'S HOME SCREEN COMPARED THIS MONTH AGAINST A LAST MONTH THE
 * DATABASE HAD TRIMMED, AND THE ERROR POINTED THE FLATTERING WAY.
 *
 * WHAT THIS PINS. `dashboard/page.tsx` read its 60 days of orders with no
 * bound, ordered `created_at` DESCENDING. Supabase caps a response at 1,000
 * rows in silence (https://supabase.com/docs/reference/javascript/select,
 * fetched 2026-09-19), so the server kept the NEWEST thousand and dropped the
 * OLDEST. The oldest rows in a 60-day window are the PRIOR 30 days, which is
 * the denominator of both percentage changes on the KPI row.
 *
 * The read is fixed where it is made, by paging. These cases exist so the
 * CONSEQUENCE is asserted rather than described: the same maths, fed the whole
 * window and then the truncated tail, produces two different growth figures,
 * and the truncated one is always the larger.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardKpis, pctChange, bucketByDay, DAY_MS, type KpiOrder } from '@/lib/dashboard/kpis'

const NOW = Date.parse('2026-09-20T00:00:00.000Z')

/** An order `daysAgo` days before NOW, for `cents`. */
function order(daysAgo: number, cents: number, status = 'confirmed'): KpiOrder {
  return {
    status,
    total_cents: cents,
    currency: 'AUD',
    created_at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
  }
}

describe('the two windows are split where the screen says they are', () => {
  it('counts the last 30 days and the 30 before it separately', () => {
    const k = computeDashboardKpis(
      [order(1, 1000), order(10, 2000), order(35, 500), order(50, 500)],
      NOW,
    )
    expect(k.ticketsSold30).toBe(2)
    expect(k.ticketsSoldPrior).toBe(2)
    expect(k.revenueCents30).toBe(3000)
    expect(k.revenuePriorCents).toBe(1000)
    expect(k.revenueDelta).toBe(200)
  })

  it('ignores an order older than the whole window', () => {
    const k = computeDashboardKpis([order(1, 1000), order(90, 9999)], NOW)
    expect(k.ticketsSoldPrior).toBe(0)
    expect(k.revenuePriorCents).toBe(0)
  })

  it('counts only CONFIRMED orders, so a refund is not a sale twice', () => {
    const k = computeDashboardKpis(
      [order(1, 1000), order(2, 4000, 'refunded'), order(3, 4000, 'partially_refunded')],
      NOW,
    )
    expect(k.ticketsSold30).toBe(1)
    expect(k.revenueCents30).toBe(1000)
  })
})

/**
 * THE DEFECT, STATED AS AN ASSERTION.
 *
 * 1,100 confirmed orders spread evenly over 60 days, all the same price. The
 * true growth is zero: 550 orders last month, 550 the month before. Truncate to
 * the newest 1,000, which is exactly what the ceiling did, and the prior period
 * loses 100 orders while the recent one loses none.
 */
describe('a truncated 60-day read inflates the growth figure', () => {
  const EVERY: KpiOrder[] = []
  for (let day = 0; day < 60; day += 1) {
    for (let n = 0; n < 18; n += 1) EVERY.push(order(day + 0.5, 1000))
  }
  // Newest first, then keep 1,000: the server's own behaviour on this read.
  const NEWEST_FIRST = [...EVERY].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const TRUNCATED = NEWEST_FIRST.slice(0, 1000)

  it('the fixture is past the ceiling and evenly split, so the true growth is zero', () => {
    expect(EVERY.length).toBe(1080)
    const whole = computeDashboardKpis(EVERY, NOW)
    expect(whole.ticketsSold30).toBe(540)
    expect(whole.ticketsSoldPrior).toBe(540)
    expect(whole.ticketsDelta).toBe(0)
    expect(whole.revenueDelta).toBe(0)
  })

  it('TRUNCATION LEAVES THE RECENT MONTH INTACT AND EATS THE PRIOR ONE', () => {
    const short = computeDashboardKpis(TRUNCATED, NOW)
    expect(short.ticketsSold30, 'this month is untouched').toBe(540)
    expect(short.ticketsSoldPrior, 'last month lost the 80 oldest orders').toBe(460)
  })

  it('so the screen reports growth where there was none, in the flattering direction', () => {
    const whole = computeDashboardKpis(EVERY, NOW)
    const short = computeDashboardKpis(TRUNCATED, NOW)

    expect(whole.ticketsDelta).toBe(0)
    expect(short.ticketsDelta).toBeGreaterThan(15)
    expect(
      short.ticketsDelta!,
      'the truncated figure must never be the smaller one; that is what makes this defect the kind nobody questions',
    ).toBeGreaterThan(whole.ticketsDelta!)
  })

  it('and at the limit a fully eaten prior period reads as +100%', () => {
    const recentOnly = EVERY.filter((o) => new Date(o.created_at).getTime() >= NOW - 30 * DAY_MS)
    const k = computeDashboardKpis(recentOnly, NOW)
    expect(k.ticketsSoldPrior).toBe(0)
    expect(k.ticketsDelta, 'growth from nothing is not a ratio, and 100 is what the screen shows')
      .toBe(100)
  })
})

describe('pctChange says nothing rather than something wrong', () => {
  it('is null when both periods are empty', () => {
    expect(pctChange(0, 0)).toBeNull()
  })
  it('is 100 when there is a current period and no prior one', () => {
    expect(pctChange(5, 0)).toBe(100)
  })
  it('is negative when the business shrank', () => {
    expect(pctChange(50, 100)).toBe(-50)
  })
})

describe('the sparkline buckets by day against the rendering instant', () => {
  it('puts today in the last bucket and 29 days ago in the first', () => {
    const b = bucketByDay([{ at: new Date(NOW - 0.5 * DAY_MS).toISOString(), value: 3 }], 30, NOW)
    expect(b[29]).toBe(3)
    const c = bucketByDay([{ at: new Date(NOW - 29.5 * DAY_MS).toISOString(), value: 7 }], 30, NOW)
    expect(c[0]).toBe(7)
  })

  it('drops an unparseable date rather than throwing on the organiser home screen', () => {
    expect(bucketByDay([{ at: 'not a date', value: 9 }], 30, NOW).every((n) => n === 0)).toBe(true)
  })
})
