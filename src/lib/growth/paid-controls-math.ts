import type { DashboardFigure } from '@/lib/admin/founder-dashboard-math'

/**
 * PAID CAMPAIGN CONTROLS, BUILT AND OFF (D7x of Lawal's DemandOS directive of 30 October 2026, section 7). A plan is a
 * record: nothing here or in the database calls an advertising platform, so nothing can spend. A person places the
 * advert by hand once Lawal has approved it, and enters what the platform charged. The DATABASE decides
 * (paid_campaign_approve, paid_campaign_start, paid_campaign_record_spend, migration *_paid_campaign_controls.sql); this
 * mirrors its rules and its words, tests/unit/growth/paid-controls.test.ts pinning the two together. Pure.
 */

/** The database's own sentences, one for each thing the directive requires. */
export const APPROVAL_PROBLEMS = {
  destination: 'No verified destination: an https address is required.',
  creative: 'No approved creative: the piece must be approved first.',
  attribution: 'No working attribution: the plan needs its tracked link.',
  budget: 'No defined budget.',
  limit: 'No spending limit: a daily limit above zero and within the budget is required.',
  objective: 'No campaign objective.',
  permission: 'No appropriate permission is recorded.',
} as const

export const START_REFUSALS = {
  off: "Paid promotion is switched off: it waits for Lawal's word.",
  notApproved: 'Only an approved plan can start.',
  monthCap: "This plan's budget could pass this month's cap.",
} as const

export interface PaidPlan {
  readonly destinationUrl: string | null
  readonly creativeApproved: boolean
  readonly hasAttributionLink: boolean
  readonly budgetCents: number
  readonly dailyLimitCents: number
  readonly objective: string | null
  readonly permissionNote: string | null
}

export function approvalProblems(p: PaidPlan): string[] {
  const out: string[] = []
  if (!p.destinationUrl || !/^https:\/\/\S+$/.test(p.destinationUrl)) out.push(APPROVAL_PROBLEMS.destination)
  if (!p.creativeApproved) out.push(APPROVAL_PROBLEMS.creative)
  if (!p.hasAttributionLink) out.push(APPROVAL_PROBLEMS.attribution)
  if (p.budgetCents <= 0) out.push(APPROVAL_PROBLEMS.budget)
  if (p.dailyLimitCents <= 0 || p.dailyLimitCents > p.budgetCents) out.push(APPROVAL_PROBLEMS.limit)
  if (!p.objective) out.push(APPROVAL_PROBLEMS.objective)
  if (!p.permissionNote?.trim()) out.push(APPROVAL_PROBLEMS.permission)
  return out
}

export function startRefusal(s: { enabled: boolean; status: string; monthlyCapCents: number; spentThisMonthCents: number; budgetCents: number }): string | null {
  if (!s.enabled) return START_REFUSALS.off
  if (s.status !== 'approved') return START_REFUSALS.notApproved
  if (s.spentThisMonthCents + s.budgetCents > s.monthlyCapCents) return START_REFUSALS.monthCap
  return null
}

/** What a recorded charge leaves: a plan that reaches its budget pauses, and a person looks. */
export function spendAfter(c: { budgetCents: number; spentCents: number }, amountCents: number): { spentCents: number; pause: boolean } {
  const spentCents = c.spentCents + amountCents
  return { spentCents, pause: spentCents >= c.budgetCents }
}

export interface PaidRead {
  readonly enabled: boolean
  readonly live: number
  readonly paused: number
  readonly spentThisMonthCents: number
  readonly monthlyCapCents: number
}

const aud = (cents: number) => `A$${(cents / 100).toFixed(2)}`

/** The counter on /admin/today: real money recorded against the cap; a paused plan asks for a person; unread is not counted. */
export function paidFigure(read: PaidRead | null, note?: string): DashboardFigure {
  const label = 'Paid campaigns (the controls)'
  if (read === null) return { label, value: null, asksForAPerson: false, href: null, kind: 'measure', cadence: 'weekly', note: note ?? 'could not be read' }
  const parts = [
    read.enabled ? 'ON' : 'OFF until Lawal says',
    `${read.live} live`,
    ...(read.paused > 0 ? [`${read.paused} paused`] : []),
    `${aud(read.spentThisMonthCents)} spent this month of a ${aud(read.monthlyCapCents)} cap`,
  ]
  return { label, value: read.paused, asksForAPerson: read.paused > 0, href: null, kind: read.paused > 0 ? 'failed' : 'measure', cadence: 'weekly', display: parts.join('; ') }
}

/** paid_state()'s one row as the client hands it back, or null: never read as zeros. */
export function paidReadFrom(data: unknown): PaidRead | null {
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined
  if (!row) return null
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN)
  const read = { enabled: row.enabled === true, live: num(row.live), paused: num(row.paused), spentThisMonthCents: num(row.spent_this_month_cents), monthlyCapCents: num(row.monthly_cap_cents) }
  return [read.live, read.paused, read.spentThisMonthCents, read.monthlyCapCents].every(Number.isFinite) ? read : null
}
