import { formatMoneyDisplay } from '@/lib/money/format'
import { CREDIT_DAYS } from '@/lib/social/results'

/**
 * THE FOUNDER DASHBOARD'S ORDER (the master mandate of 29 October 2026, section 14: "Prioritise actionable exceptions.
 * Do not create a dashboard that merely reproduces database tables. The interface should tell the founder what requires
 * attention and what the system has already completed.").
 *
 * Five sections (events, organisers, marketing, revenue and conversion, operations), each a handful of figures read by
 * ./founder-dashboard.ts and the lines the system has already done. A figure needs attention when it asks for a person
 * and is counted above zero; a section with any comes first, and inside it those figures lead. A figure that could not
 * be counted is said so, never shown as 0 and never flagged. Pure.
 */

export type DashboardKey = 'events' | 'organisers' | 'marketing' | 'conversion' | 'economics' | 'expansion' | 'operations'

export interface DashboardFigure {
  readonly label: string
  /** null when its source could not be counted on this database. */
  readonly value: number | null
  /** True when a non-zero value is work waiting for a person (to approve, check, fix); false for a plain measure. */
  readonly asksForAPerson: boolean
  /** Where the person acts on it, or null. */
  readonly href: string | null
  readonly note?: string
  /** How the value reads when a plain number would not (money, the deployed commit). */
  readonly display?: string
  /** Its place in the view by exception (byException): work to approve, a failure, something scheduled, value made, or a plain measure. */
  readonly kind?: FigureKind
  /** How often the founder reads it (rhythm): the supreme specification's section 29. A figure with none reads weekly. */
  readonly cadence?: Cadence
}

export type FigureKind = 'approve' | 'failed' | 'scheduled' | 'value' | 'measure'
export type Cadence = 'daily' | 'weekly' | 'monthly'

export interface DashboardSection {
  readonly key: DashboardKey
  readonly title: string
  readonly figures: readonly DashboardFigure[]
  /** What the system has already done, in plain words. */
  readonly done: readonly string[]
}

export interface ArrangedFigure extends DashboardFigure {
  readonly attention: boolean
}

export interface ArrangedSection extends Omit<DashboardSection, 'figures'> {
  readonly figures: readonly ArrangedFigure[]
  readonly needsYou: number
}

export function needsAttention(f: DashboardFigure): boolean {
  return f.asksForAPerson && f.value !== null && f.value > 0
}

export function arrangeDashboard(sections: readonly DashboardSection[]): ArrangedSection[] {
  const arranged = sections.map((s, i) => {
    const figures = s.figures.map((f) => ({ ...f, attention: needsAttention(f) }))
    const ordered = [...figures.filter((f) => f.attention), ...figures.filter((f) => !f.attention)]
    return { section: { ...s, figures: ordered, needsYou: ordered.filter((f) => f.attention).length }, i }
  })
  return arranged
    .sort((a, b) => Number(b.section.needsYou > 0) - Number(a.section.needsYou > 0) || a.i - b.i)
    .map((a) => a.section)
}

/**
 * THE DASHBOARD BY EXCEPTION (the supreme specification of 30 October 2026, section 28: "what the system completed, what
 * is scheduled, what failed, what requires approval, what generated measurable value, what needs attention next").
 * Each group holds only the counted figures of its kind that are above zero, so a quiet day reads empty, not as a wall
 * of zeros; approvals and failures largest first. NEXT is the one most urgent thing: a failure before an approval. A
 * figure that could not be counted goes to notCounted, never into a group as if it were 0.
 */
export interface ExceptionView {
  readonly completed: readonly string[]
  readonly scheduled: readonly DashboardFigure[]
  readonly failed: readonly DashboardFigure[]
  readonly needsApproval: readonly DashboardFigure[]
  readonly value: readonly DashboardFigure[]
  readonly next: DashboardFigure | null
  readonly notCounted: readonly DashboardFigure[]
}

export function byException(sections: readonly DashboardSection[]): ExceptionView {
  const all = sections.flatMap((s) => s.figures)
  const counted = all.filter((f) => f.value !== null && f.value > 0)
  const of = (kind: FigureKind) => counted.filter((f) => f.kind === kind)
  const largestFirst = (fs: DashboardFigure[]) => [...fs].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const failed = largestFirst(of('failed'))
  const needsApproval = largestFirst(of('approve'))
  return {
    completed: sections.flatMap((s) => s.done),
    scheduled: of('scheduled'),
    failed,
    needsApproval,
    value: of('value'),
    next: failed[0] ?? needsApproval[0] ?? null,
    notCounted: all.filter((f) => f.value === null),
  }
}

/**
 * THE OPERATING RHYTHM (the supreme specification, section 29): every figure once, in its cadence, in the order the
 * sections give it. Daily: event accuracy, organiser responses, failed jobs, upcoming campaigns, ticketing issues.
 * Weekly: approvals, acquisition, supply, conversion. Monthly: organiser retention, ticketing contribution, acquisition
 * costs, cash flow, expansion readiness. A figure with no cadence reads weekly, where the growth week reads.
 */
export function rhythm(sections: readonly DashboardSection[]): Record<Cadence, DashboardFigure[]> {
  const out: Record<Cadence, DashboardFigure[]> = { daily: [], weekly: [], monthly: [] }
  for (const f of sections.flatMap((s) => s.figures)) out[f.cadence ?? 'weekly'].push(f)
  return out
}

/**
 * PARTNER KITS SENT VERSUS USED (the growth blueprint of 30 October 2026, section 4D: "A partner kit sent is not a partner
 * kit used. That distinction belongs in the dashboard."). Sent: a kit recorded as gone within the last CREDIT_DAYS days.
 * Used: a sent kit whose own share link was tapped at least once from when it went to the end of the same credit window
 * (the reader passes real taps only, QA presses left out). A sent kit with no link of its own cannot be judged, so it is
 * counted apart and never as unused.
 */
export function kitsSentAndUsed(
  kits: readonly { readonly sentAt: string | null; readonly linkId: string | null }[],
  taps: readonly { readonly linkId: string; readonly at: string }[],
  now: Date,
): { sent: number; used: number; withoutALink: number } {
  const windowMs = CREDIT_DAYS * 86_400_000
  const sent = kits.filter((k) => k.sentAt !== null && Date.parse(k.sentAt) <= now.getTime() && now.getTime() - Date.parse(k.sentAt) < windowMs)
  const used = sent.filter((k) => {
    if (k.linkId === null) return false
    const from = Date.parse(k.sentAt as string)
    return taps.some((t) => t.linkId === k.linkId && Date.parse(t.at) >= from && Date.parse(t.at) < from + windowMs)
  })
  return { sent: sent.length, used: used.length, withoutALink: sent.filter((k) => k.linkId === null).length }
}

/**
 * ECONOMICS, HONEST (the PM's rulings of 30 October 2026, ruling 6): gross ticket sales, the platform fee earned, the
 * payment cost (Stripe's estimate each order records), the contribution (the fee kept less that cost), and break-even
 * volume at the current fee, from the growth week's sold orders. LAW 24's free months are already a fee of 0 on those
 * orders. External referrals are never revenue and are not here. Break-even needs a monthly fixed cost, which no table
 * holds, so it is not counted rather than assumed.
 */
export function economicsFigures(h: {
  readonly orderValueCents: number
  readonly feeRevenueCents: number
  readonly processingCents: number
  readonly marginCents: number
  readonly marginUnrecorded: number
}): DashboardFigure[] {
  const money = (label: string, cents: number, note?: string): DashboardFigure => ({
    label,
    value: cents,
    asksForAPerson: false,
    href: '/admin/growth',
    display: formatMoneyDisplay(cents, 'AUD'),
    ...(note ? { note } : {}),
  })
  const unrecorded = h.marginUnrecorded === 0 ? undefined : `${h.marginUnrecorded} ${h.marginUnrecorded === 1 ? 'order does' : 'orders do'} not record it and ${h.marginUnrecorded === 1 ? 'is' : 'are'} left out`
  return [
    money('Gross ticket sales last week', h.orderValueCents),
    money('Platform fee earned last week', h.feeRevenueCents),
    money('Payment cost last week', h.processingCents, unrecorded),
    money('Contribution last week', h.marginCents, unrecorded),
    { label: 'Break-even volume', value: null, asksForAPerson: false, href: null, note: 'no monthly fixed cost is recorded, so none is assumed' },
  ]
}

/** A count as the reader hands it: a number, or null with the reason it could not be read. */
export interface CountRead {
  readonly value: number | null
  readonly note?: string
}

/**
 * THE CONTROL CENTRE'S INVENTORY ROWS (the DemandOS directive of 30 October 2026, section 11: "upcoming event
 * inventory", "broken links", "venue partnerships"; the blueprint's section 8: "events happening in the next 7, 14 and
 * 30 days"). The nights ahead are public, published and not seed data; a booking link the daily check found dead on an
 * upcoming night asks for a person; venue partners are the live partners of kind venue. Pure.
 */
export function inventoryFigures(c: { next7: CountRead; next14: CountRead; next30: CountRead; deadLinks: CountRead; venuePartners: CountRead }): DashboardFigure[] {
  const of = (label: string, r: CountRead, asksForAPerson: boolean, href: string | null, kind: FigureKind, cadence: Cadence): DashboardFigure => ({
    label,
    value: r.value,
    asksForAPerson,
    href,
    kind,
    cadence,
    ...(r.note ? { note: r.note } : {}),
  })
  return [
    of('Public nights in the next 7 days', c.next7, false, null, 'measure', 'daily'),
    of('Public nights in the next 14 days', c.next14, false, null, 'measure', 'daily'),
    of('Public nights in the next 30 days', c.next30, false, null, 'measure', 'daily'),
    of('Booking links found dead on upcoming nights', c.deadLinks, true, '/admin/events', 'failed', 'daily'),
    of('Venue partners live', c.venuePartners, false, '/admin/partners', 'measure', 'weekly'),
  ]
}

/**
 * A head count's answer as a figure's value. A count request on a table the API cannot reach answered status 204, count
 * null, error null (read on TEST, 30 October 2026), so null is never read as 0: what cannot be read is not counted.
 */
export function countFrom(answer: { count: number | null; error: { message: string } | null }): CountRead {
  if (answer.error) return { value: null, note: `could not be read: ${answer.error.message}` }
  if (answer.count === null) return { value: null, note: 'could not be read: the count came back empty' }
  return { value: answer.count }
}
