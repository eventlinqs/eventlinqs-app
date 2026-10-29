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

export type DashboardKey = 'events' | 'organisers' | 'marketing' | 'conversion' | 'economics' | 'operations'

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
}

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
