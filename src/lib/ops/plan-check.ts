/**
 * THE DAILY PLAN CHECK (Lawal's specification of 20 November 2026, 09:01, item 3: "by 07:00 Melbourne each day's posts
 * must be planned and scheduled from approved designs; if the plan is missing the engine detects it, recovers, and
 * alerts"). On 20 November the 05:40 and 06:40 social runs read '0 scheduled' and nothing said why: the standing policy
 * runs only while the publishing switch is on, and its refusals went to the function log alone.
 *
 * At the schedule and live phases the social run reads the policy's own dry run (store.ts standingPolicyDryRun: every
 * drafted piece, eligible or not and why) and what is scheduled for the rest of the day, and writes both on its phase row,
 * the refusals counted by reason. A day with nothing scheduled for the rest of it is a failed phase: the board and the
 * 08:00 report say so (src/lib/ops/missed-runs.ts, learned-lines.ts). Pure.
 */
export interface PlanRow {
  readonly eligible: boolean
  readonly reasons: readonly string[]
}

/** A reason's head, so like refusals count together: its words up to the first colon or full stop, at most 80 characters. */
export function reasonHead(reason: string): string {
  const cut = reason.search(/[:.]/)
  const head = (cut > 0 ? reason.slice(0, cut) : reason).trim()
  return head.length > 80 ? `${head.slice(0, 79).trimEnd()}...` : head
}

export function planCheckWords(plan: readonly PlanRow[] | null, scheduledLaterToday: number): { readonly words: string; readonly failed: boolean } {
  const later = scheduledLaterToday === 0 ? 'NOTHING scheduled for the rest of today' : `${scheduledLaterToday} scheduled for the rest of today`
  if (plan === null) return { words: `plan: no campaign this week; ${later}`, failed: scheduledLaterToday === 0 }
  const eligible = plan.filter((r) => r.eligible).length
  const counts = new Map<string, number>()
  for (const r of plan) {
    if (r.eligible) continue
    for (const head of new Set(r.reasons.map(reasonHead))) counts.set(head, (counts.get(head) ?? 0) + 1)
  }
  const refused = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([head, n]) => `${head} (${n})`)
    .join('; ')
  return {
    words: `plan: ${plan.length} drafted, ${eligible} eligible under the standing policy${refused ? `; refused: ${refused}` : ''}; ${later}`,
    failed: scheduledLaterToday === 0,
  }
}

/**
 * M4 (the PM's 12:18 of 27 November 2026: "4 of this week's 7 pieces have no approval"): the drafted pieces the standing
 * policy cannot approve, so a person must, each named with its first reason. The 05:40 schedule run writes them on its own
 * row and emails hello@ the one line, so Lawal can approve them at /admin/social before 09:00. Pure.
 */
export function approvalsNeeded(plan: readonly (PlanRow & { readonly label: string })[] | null): string[] {
  return (plan ?? []).filter((r) => !r.eligible).map((r) => `${r.label} (${reasonHead(r.reasons[0] ?? 'no reason given')})`)
}

export function approvalsNeededWords(names: readonly string[]): string {
  return names.length === 0 ? "no piece needs a person's approval" : `${names.length} need a person's approval at /admin/social: ${names.join('; ')}`
}
