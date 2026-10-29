/**
 * THE ORGANISER FUNNEL, AND EVENTS PER ACTIVE ORGANISER PER MONTH (the EventLinqs engine plan of 28 October 2026, part
 * H: "Add: organiser funnel, events per active organiser per month"; Lawal's final directive, section 25: "Active
 * recurring organisers ... Events per active organiser ... Repeat organiser submissions").
 *
 * THE FUNNEL follows the plan's organiser journey, one stage each, every count the number of organisers recorded at
 * that stage: found, qualified (a lawful basis recorded), invited, claimed, said yes to their promotional material,
 * added their own photos, publishing (a public night in the next 90 days), reported (an after-the-night report sent in
 * the last 30 days). An organiser who reached a later stage another way (a claim with no invitation) counts there and
 * not at the stage skipped, so a step's share can pass 100 percent (./organiser-funnel.ts reads each stage). A stage
 * whose source has not landed on this database is NOT COUNTED and said so, never shown as 0, and the step into or out
 * of it has no rate.
 *
 * EVENTS PER ACTIVE ORGANISER, per Melbourne month: an organiser is active in a month when at least one public night of
 * theirs starts in it; the figure is that month's public nights divided by its active organisers. A month with none
 * active has no figure, never 0.
 *
 * WHO AN ORGANISER IS comes from the caller: window 6's organisers (one row per real host, a curated venue's host
 * before any claim), never organisations.id alone, which puts every curated night under the one listings account.
 *
 * Pure.
 */

export const FUNNEL_STAGES = ['found', 'qualified', 'invited', 'claimed', 'yes', 'photos', 'publishing', 'reported'] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export const FUNNEL_WORDS: Readonly<Record<FunnelStage, string>> = {
  found: 'Found',
  qualified: 'Lawful basis recorded',
  invited: 'Invited',
  claimed: 'Claimed their listing',
  yes: 'Said yes to their material',
  photos: 'Added their own photos',
  publishing: 'A night in the next 90 days',
  reported: 'Sent a report in the last 30 days',
}

/** Per stage: the organisers at it, or null when its source has not landed. */
export type StageCounts = Readonly<Record<FunnelStage, number | null>>

export interface FunnelStep {
  readonly stage: FunnelStage
  readonly words: string
  readonly organisers: number | null
  /** The share of the stage before that reached this one, 0 to 1; null for the first stage, or when either is not counted or the one before is 0. */
  readonly fromBefore: number | null
}

export function funnelOf(counts: StageCounts): FunnelStep[] {
  return FUNNEL_STAGES.map((stage, i) => {
    const here = counts[stage]
    const before = i === 0 ? null : counts[FUNNEL_STAGES[i - 1]]
    return {
      stage,
      words: FUNNEL_WORDS[stage],
      organisers: here,
      fromBefore: here === null || before === null || before === 0 ? null : here / before,
    }
  })
}

export interface OrganiserNight {
  readonly organiser: string
  readonly startDate: string
  readonly isPublic: boolean
}

export interface MonthFigure {
  /** YYYY-MM in the zone given. */
  readonly month: string
  readonly activeOrganisers: number
  readonly nights: number
  readonly perActive: number | null
}

/** The month a moment falls in, in the zone given, as YYYY-MM. */
export function monthOf(iso: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/**
 * The n months ending at the one given (YYYY-MM), oldest first, by arithmetic on the month itself, so no date is built
 * in UTC and a year boundary is plain counting ('2026-01' with 2 is 2025-12 and 2026-01).
 */
export function monthsEndingAt(month: string, n: number): string[] {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!m) throw new Error(`monthsEndingAt: '${month}' is not a YYYY-MM month`)
  const last = Number(m[1]) * 12 + (Number(m[2]) - 1)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const index = last - i
    out.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

/** Events per active organiser for each month asked, oldest first; only public nights count. */
export function eventsPerActiveOrganiser(nights: readonly OrganiserNight[], months: readonly string[], zone: string): MonthFigure[] {
  return [...months].sort().map((month) => {
    const mine = nights.filter((n) => n.isPublic && monthOf(n.startDate, zone) === month)
    const active = new Set(mine.map((n) => n.organiser)).size
    return { month, activeOrganisers: active, nights: mine.length, perActive: active === 0 ? null : mine.length / active }
  })
}
