import type { DashboardFigure } from '@/lib/admin/founder-dashboard-math'

/**
 * THE GOOGLE COST GUARD, its pure rules (the PROJECT MANAGER's 16:52 of 30 October 2026: "a daily quota and a monthly
 * spend cap, the counter on /admin/today"; Google stays OFF until Lawal says, as he wants the cost first).
 *
 * The DATABASE decides: public.google_spend_reserve (migration *_google_spend_guard.sql) takes every reservation on one
 * locked settings row, so two callers can never both take the last unit. This file mirrors its order and its words so
 * the server can explain a refusal and the dashboard can say where the spend stands; tests/unit/google/spend-guard.test.ts
 * pins the two together. Money is in micro US dollars (Google bills in US dollars), so a unit price of a fraction of a
 * cent stays a whole number.
 */

/** The database's own sentences, in the order it tests them. */
export const REFUSALS = {
  units: 'A Google call must reserve at least one unit.',
  off: "Google is switched off: it waits for Lawal's word.",
  unpriced: 'No price is recorded for this Google call, so it is not made.',
  daily: "Today's Google call quota is reached.",
  monthly: "This month's Google spend cap would be passed.",
} as const

/** The Google calls a price is recorded for (google_spend_prices). Anything else is refused as unpriced. */
export type GoogleApi = 'places_photo' | 'places_text_search'

export interface SpendState {
  readonly enabled: boolean
  readonly dailyCallQuota: number
  readonly monthlyCapMicros: number
  readonly unitPriceMicros: number | null
  readonly callsToday: number
  readonly spentThisMonthMicros: number
}

export type SpendDecision = { readonly allowed: true; readonly costMicros: number } | { readonly allowed: false; readonly reason: string }

export function spendDecision(s: SpendState, units: number): SpendDecision {
  if (!Number.isInteger(units) || units < 1) return { allowed: false, reason: REFUSALS.units }
  if (!s.enabled) return { allowed: false, reason: REFUSALS.off }
  if (s.unitPriceMicros === null) return { allowed: false, reason: REFUSALS.unpriced }
  if (s.callsToday + units > s.dailyCallQuota) return { allowed: false, reason: REFUSALS.daily }
  const costMicros = units * s.unitPriceMicros
  if (s.spentThisMonthMicros + costMicros > s.monthlyCapMicros) return { allowed: false, reason: REFUSALS.monthly }
  return { allowed: true, costMicros }
}

/** What google_spend_state() answers, read for /admin/today. */
export interface SpendRead {
  readonly enabled: boolean
  readonly dailyCallQuota: number
  readonly monthlyCapMicros: number
  readonly callsToday: number
  readonly spentThisMonthMicros: number
  readonly refusedToday: number
}

/** google_spend_state()'s one row as the client hands it back (a bigint may arrive as a numeric string); null if absent or unreadable. */
export function spendReadFrom(data: unknown): SpendRead | null {
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined
  if (!row) return null
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN)
  const read = {
    enabled: row.enabled === true,
    dailyCallQuota: num(row.daily_call_quota),
    monthlyCapMicros: num(row.monthly_cap_micros),
    callsToday: num(row.calls_today),
    spentThisMonthMicros: num(row.spent_this_month_micros),
    refusedToday: num(row.refused_today),
  }
  return Object.values(read).some((v) => typeof v === 'number' && !Number.isFinite(v)) ? null : read
}

const usd = (micros: number) => `US$${(micros / 1_000_000).toFixed(2)}`

/**
 * The counter on /admin/today, read every day: the spend against the cap and the calls against the quota. A refused
 * call is a failure that asks for Lawal (raise the limit or leave it); a spend that could not be read is not counted,
 * never 0.
 */
export function googleSpendFigure(read: SpendRead | null, note?: string): DashboardFigure {
  const base = { label: 'Google calls refused today (the cost guard)', asksForAPerson: true, href: null, kind: 'failed', cadence: 'daily' } as const
  if (read === null) return { ...base, value: null, note: note ?? 'could not be read' }
  const parts = [
    read.enabled ? 'ON' : 'OFF until Lawal says',
    `${usd(read.spentThisMonthMicros)} of a ${usd(read.monthlyCapMicros)} cap this month`,
    `${read.callsToday} of ${read.dailyCallQuota} calls today`,
    ...(read.refusedToday > 0 ? [`${read.refusedToday} refused today`] : []),
  ]
  return { ...base, value: read.refusedToday, display: parts.join('; ') }
}
