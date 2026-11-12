/**
 * THE MASTER PLAN'S GATES ON THE COMMAND CENTRE (the PM's 09:19 of 12 November 2026, item 3, on Lawal's 09:16 to 09:19:
 * "The master plan Lawal holds is the Claude Doc 'EventLinqs master plan: full-time in six months' ... Its gates are now
 * Growth OS targets the scorecard tracks"). Each gate is counted by a rule the platform already holds, never a second
 * definition:
 *
 *   selling          a published, public night still ahead that sells on EventLinqs: no outside ticket link, and an
 *                    active, visible tier priced above $0 (the CRM's 'Ticketing activated', src/lib/crm/stages.ts)
 *   recurring        an organisation with paid orders (confirmed or partially refunded, above $0) in two or more
 *                    calendar months, Melbourne time (the CRM's 'Recurring')
 *   checked          the supply scorecard's verified upcoming nights, every market added (src/lib/growth/supply-scorecard)
 *   melbourne paid   a recurring organisation that also has a night selling on EventLinqs in Melbourne now: active,
 *                    recurring and paid, in Melbourne
 *   outreach today   outreach messages sent today, Melbourne time (paused until Release 2 is outreach ready)
 *
 * Pure: plan-gates.ts reads the rows.
 */

export type GateMeasure = 'selling' | 'recurring' | 'checked' | 'melbourne_paid' | 'outreach_today'

export interface PlanGate {
  readonly key: string
  readonly label: string
  readonly target: number
  /** The day the gate is due, Melbourne time; null for a daily quota. */
  readonly due: string | null
  readonly measure: GateMeasure
}

/** The gates, in the plan's words and dates (the PM's 09:19 item 3). */
export const PLAN_GATES: readonly PlanGate[] = [
  { key: 'selling-20', label: 'Events selling through EventLinqs', target: 20, due: '2026-12-13', measure: 'selling' },
  { key: 'selling-50', label: 'Events selling through EventLinqs', target: 50, due: '2027-01-31', measure: 'selling' },
  { key: 'recurring-30', label: 'Recurring organisers', target: 30, due: '2027-01-31', measure: 'recurring' },
  { key: 'checked-300', label: 'Checked upcoming events', target: 300, due: '2027-01-31', measure: 'checked' },
  { key: 'melbourne-paid-10', label: 'Active, recurring, paid-event organisers in Melbourne', target: 10, due: '2027-03-31', measure: 'melbourne_paid' },
  { key: 'outreach-20', label: 'Outreach messages sent today', target: 20, due: null, measure: 'outreach_today' },
]

export const PLAN_ZONE = 'Australia/Melbourne'

/** 'YYYY-MM-DD' of an instant in Melbourne. */
export function melbourneDay(at: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: PLAN_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export interface PaidOrder {
  readonly organisationId: string | null
  readonly confirmedAt: string | null
}

/** The organisations with paid orders in two or more calendar months, Melbourne time. */
export function recurringOrganisations(orders: readonly PaidOrder[]): Set<string> {
  const months = new Map<string, Set<string>>()
  for (const o of orders) {
    if (!o.organisationId || !o.confirmedAt) continue
    const month = melbourneDay(new Date(o.confirmedAt)).slice(0, 7)
    const set = months.get(o.organisationId) ?? new Set<string>()
    set.add(month)
    months.set(o.organisationId, set)
  }
  return new Set([...months].filter(([, m]) => m.size >= 2).map(([id]) => id))
}

export interface GateStanding {
  readonly gate: PlanGate
  readonly value: number
  readonly met: boolean
  /** Whole days left to the due day, from today in Melbourne; null for a daily quota. */
  readonly daysLeft: number | null
  /** What is still needed each week to reach it by its day; null when met or daily. */
  readonly perWeek: number | null
  /** Past its day and not met. */
  readonly late: boolean
}

/** Where a gate stands today. */
export function gateStanding(gate: PlanGate, value: number, now: Date): GateStanding {
  const met = value >= gate.target
  if (gate.due === null) return { gate, value, met, daysLeft: null, perWeek: null, late: false }
  const today = melbourneDay(now)
  const daysLeft = Math.round((Date.parse(`${gate.due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  const late = !met && daysLeft < 0
  const perWeek = met || late ? null : Math.ceil(((gate.target - value) / Math.max(daysLeft, 1)) * 7)
  return { gate, value, met, daysLeft, perWeek, late }
}

export interface GateCounts {
  readonly selling: number
  readonly recurring: number
  readonly checked: number
  readonly melbourne_paid: number
  readonly outreach_today: number
}

/** Every gate's standing from one set of counts. */
export function planGates(counts: GateCounts, now: Date): GateStanding[] {
  return PLAN_GATES.map((g) => gateStanding(g, counts[g.measure], now))
}
