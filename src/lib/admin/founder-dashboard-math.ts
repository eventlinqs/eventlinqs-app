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

export type DashboardKey = 'events' | 'organisers' | 'marketing' | 'conversion' | 'operations'

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
