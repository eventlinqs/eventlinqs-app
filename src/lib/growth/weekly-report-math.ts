import { CRM_LINE, FROM_ACQUISITION, stageRank, type CrmStage } from '@/lib/crm/stages'

/**
 * THE WEEKLY REPORT, ITS ARITHMETIC (order 4, Release 3, item 10: "Search Console, the internal real visitor record and
 * server side events, CRM conversion and the transaction records joined in one weekly report; the six numbers plus
 * pipeline conversion and overdue tasks; failure alerts". WINDOW 5A, 13 November 2026; the plan:
 * C:\dev\EVIDENCE\EL-12NOV\growth-os\PLAN-release3-weekly-report.md). INTERNAL ONLY. Pure: the rows come from
 * ./weekly-report.ts, the clock from the caller.
 *
 * Release 3's acceptance: "we can name which activities produce activated organisers, ticket sales and contribution".
 * So the pipeline is read from public.organiser_acquisition_transitions, every state change with the table that proved
 * it (proved_by): a week's moves say both how many organisers moved on and what moved them.
 *
 * THE STAGES ARE LAWAL'S (src/lib/crm/stages.ts), never a new list: an acquisition state is shown as its CRM stage
 * (FROM_ACQUISITION); the states reach Claimed at most, because Ticketing Activated, First Sale and Recurring are proved
 * by transactions alone, which the six numbers count (src/lib/growth/six-numbers.ts). A move counts only FORWARD along
 * Lawal's line (a higher stageRank); a move to a side stage (opted out, not interested) is counted apart.
 */

export type Week = { readonly from: string; readonly to: string }

/**
 * What proved a move, in words: the page's section and the morning email's Monday copy both read this one map, so the
 * two never word a proof differently. A table not named here is shown by its own name.
 */
const PROOF_WORDS: Readonly<Record<string, string>> = {
  outreach_touches: 'a message sent',
  outreach_replies: 'a reply',
  listing_claims: 'a claim',
  organiser_venues: 'a venue linked',
  organisers: 'their record',
  events: 'a listing',
  orders: 'an order',
}
export const proofWords = (table: string): string => PROOF_WORDS[table] ?? table

export type Transition = {
  readonly organiserId: string
  readonly from: string | null
  readonly to: string
  readonly at: string
  /** The table whose row proved the move (an outreach touch, a claim, a listing, an order). */
  readonly provedBy: string
}

export type ReportTask = {
  readonly status: 'open' | 'waiting_approval' | 'in_progress' | 'done' | 'failed' | 'cancelled'
  readonly dueAt: string | null
  readonly recordType: string
  readonly title: string
  readonly failureReason: string | null
}

export type StageMove = { readonly stage: CrmStage; readonly organisers: number; readonly provedBy: readonly { readonly by: string; readonly moves: number }[] }
export type StageStep = { readonly from: CrmStage; readonly to: CrmStage; readonly reachedFrom: number; readonly reachedTo: number }

export type WeeklyReport = {
  readonly week: Week
  /** Organisers who moved forward INTO each line stage this week, and what proved the moves. */
  readonly moved: readonly StageMove[]
  /** Organisers who moved to a side stage this week (opted out, not interested, unresponsive, removal asked). */
  readonly leftTheLine: number
  /** Up to the week's end: of the organisers who ever reached a stage, how many reached the next. */
  readonly conversion: readonly StageStep[]
  readonly overdueTasks: readonly ReportTask[]
  readonly failedJobs: readonly ReportTask[]
}

const stageOf = (state: string | null): CrmStage | null =>
  state !== null && Object.prototype.hasOwnProperty.call(FROM_ACQUISITION, state) ? FROM_ACQUISITION[state as keyof typeof FROM_ACQUISITION] : null
const onTheLine = (s: CrmStage): boolean => (CRM_LINE as readonly string[]).includes(s)

export function weeklyReport(input: {
  readonly week: Week
  readonly now: string
  readonly transitions: readonly Transition[]
  readonly tasks: readonly ReportTask[]
}): WeeklyReport {
  const { week, now } = input
  const inWeek = (at: string) => at >= week.from && at < week.to
  const forward = (t: Transition): CrmStage | null => {
    const to = stageOf(t.to)
    if (!to || !onTheLine(to)) return null
    const from = stageOf(t.from)
    return from === null || stageRank(to) > stageRank(from) ? to : null
  }

  const movedBy = new Map<CrmStage, { organisers: Set<string>; by: Map<string, number> }>()
  let leftTheLine = 0
  for (const t of input.transitions) {
    if (!inWeek(t.at)) continue
    const to = stageOf(t.to)
    if (to && !onTheLine(to)) {
      leftTheLine++
      continue
    }
    const stage = forward(t)
    if (!stage) continue
    const m = movedBy.get(stage) ?? { organisers: new Set<string>(), by: new Map<string, number>() }
    m.organisers.add(t.organiserId)
    m.by.set(t.provedBy, (m.by.get(t.provedBy) ?? 0) + 1)
    movedBy.set(stage, m)
  }
  const moved: StageMove[] = CRM_LINE.filter((s) => movedBy.has(s)).map((stage) => {
    const m = movedBy.get(stage)!
    return {
      stage,
      organisers: m.organisers.size,
      provedBy: [...m.by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([by, moves]) => ({ by, moves })),
    }
  })

  // The furthest line stage each organiser had reached by the week's end.
  const furthest = new Map<string, number>()
  for (const t of input.transitions) {
    if (t.at >= week.to) continue
    const to = stageOf(t.to)
    if (!to || !onTheLine(to)) continue
    furthest.set(t.organiserId, Math.max(furthest.get(t.organiserId) ?? -1, stageRank(to)))
  }
  const reached = (stage: CrmStage) => [...furthest.values()].filter((r) => r >= stageRank(stage)).length
  const line = CRM_LINE.filter((s) => s !== 'ticketing_activated' && s !== 'first_sale' && s !== 'recurring')
  const conversion: StageStep[] = line.slice(0, -1).map((from, i) => ({ from, to: line[i + 1], reachedFrom: reached(from), reachedTo: reached(line[i + 1]) }))

  const live = (t: ReportTask) => t.status === 'open' || t.status === 'waiting_approval' || t.status === 'in_progress'
  const overdueTasks = input.tasks
    .filter((t) => live(t) && t.dueAt !== null && t.dueAt < now)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const failedJobs = input.tasks.filter((t) => t.status === 'failed')

  return { week, moved, leftTheLine, conversion, overdueTasks, failedJobs }
}
