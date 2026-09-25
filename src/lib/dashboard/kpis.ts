/**
 * THE FOUR FIGURES ON THE ORGANISER'S HOME SCREEN, DERIVED IN ONE PLACE SO THEY
 * CAN BE PUT UNDER TEST.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS. This maths lived inside `dashboard/page.tsx`, a
 * server component, where nothing could reach it. It is the part of that screen
 * that was WRONG, and it was wrong in the direction nobody questions.
 *
 * The orders behind it were read with no bound, newest-first, over a 60-day
 * window. Supabase caps a response at 1,000 rows in silence
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * so the server kept the NEWEST thousand and dropped the OLDEST. The oldest
 * rows in a 60-day window are the PRIOR 30 days, and the prior 30 days is the
 * denominator of both percentage changes below.
 *
 * So an organiser past a thousand orders in 60 days was not shown a low number.
 * They were shown GROWTH THAT WAS TOO HIGH, because last month had been trimmed
 * while this month survived intact. `pctChange` returns 100 when the previous
 * period is zero, so a fully truncated prior period renders as "+100%".
 *
 * The read is fixed where it is made. This module exists so the CONSEQUENCE can
 * be asserted rather than described: `tests/unit/dashboard/kpis.test.ts` feeds
 * it the whole 60 days and then the truncated tail, and the two disagree.
 */

export interface KpiOrder {
  status: string
  total_cents: number
  currency: string
  created_at: string
}

export interface DashboardKpis {
  ticketsSold30: number
  ticketsSoldPrior: number
  revenueCents30: number
  revenuePriorCents: number
  /** null when there is no prior period to compare against. */
  ticketsDelta: number | null
  revenueDelta: number | null
  ticketsSparkline: number[]
  revenueSparkline: number[]
  currency: string
}

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Percentage change, with the one case that is not a percentage spelled out:
 * growth from nothing is not a ratio. Zero to zero is `null` (nothing to say),
 * zero to something is 100.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

export function bucketByDay(
  items: { at: string; value: number }[],
  days: number,
  now: number = Date.now(),
): number[] {
  const buckets = new Array<number>(days).fill(0)
  for (const item of items) {
    const t = new Date(item.at).getTime()
    if (Number.isNaN(t)) continue
    const index = days - 1 - Math.floor((now - t) / DAY_MS)
    if (index >= 0 && index < days) buckets[index] += item.value
  }
  return buckets
}

/**
 * @param orders every order in the 60-day window. EVERY one: this function
 *   cannot tell a short read from a quiet month, which is the whole reason the
 *   read that feeds it pages.
 * @param now    the instant the page is rendering for, injected so the windows
 *   are deterministic under test.
 */
export function computeDashboardKpis(orders: KpiOrder[], now: number): DashboardKpis {
  const confirmed = orders.filter((o) => o.status === 'confirmed')

  const last30 = confirmed.filter((o) => new Date(o.created_at).getTime() >= now - 30 * DAY_MS)
  const prior30 = confirmed.filter((o) => {
    const t = new Date(o.created_at).getTime()
    return t < now - 30 * DAY_MS && t >= now - 60 * DAY_MS
  })

  const ticketsSold30 = last30.length
  const ticketsSoldPrior = prior30.length
  const revenueCents30 = last30.reduce((sum, o) => sum + (o.total_cents ?? 0), 0)
  const revenuePriorCents = prior30.reduce((sum, o) => sum + (o.total_cents ?? 0), 0)

  return {
    ticketsSold30,
    ticketsSoldPrior,
    revenueCents30,
    revenuePriorCents,
    ticketsDelta: pctChange(ticketsSold30, ticketsSoldPrior),
    revenueDelta: pctChange(revenueCents30, revenuePriorCents),
    ticketsSparkline: bucketByDay(last30.map((o) => ({ at: o.created_at, value: 1 })), 30, now),
    revenueSparkline: bucketByDay(
      last30.map((o) => ({ at: o.created_at, value: o.total_cents ?? 0 })),
      30,
      now,
    ),
    currency: last30[0]?.currency ?? 'AUD',
  }
}
