/**
 * THE ACQUISITION FUNNEL, V3 ITEM 3 (Lawal's Growth Engine V3 build checklist, decided 1 November 2026 05:12, "build it
 * as written"): "Ten stages recorded: identified, qualified, contact permitted, contacted, responded, interested,
 * ownership verified, ticketing activated, first paid sale, repeat paid organiser"; "Outside-ticketed events never
 * counted as EventLinqs revenue"; "A claim or a ticket tier never counted as a paid sale"; "Actual conversion rate shown
 * between every stage". Item 10 adds: "Every number split by city, organiser group and source."
 *
 * Each stage is a fact read from the row that proves it (./acquisition.ts), never typed:
 *   identified           the organisers row.
 *   qualified            a public night of theirs in the last or next 90 days (the acquisition state's own test).
 *   contact permitted    a contact with a whole consent basis recorded (organiser_contacts.basis other than 'none').
 *   contacted            a touch sent to one of their contacts.
 *   responded            any reply logged.
 *   interested           a reply whose outcome is yes or interested.
 *   ownership verified   the acquisition state reached verified (a verified claim, or their own account linked).
 *   ticketing activated  a paid ticket tier (above A$0) on a night under their own EventLinqs account.
 *   first paid sale      a paid EventLinqs order (confirmed or partly refunded, above A$0; the scorecard's own rule).
 *   repeat paid organiser paid orders on two or more of their events.
 * An outside ticket link is never a stage at all, and a tier or a claim is never a sale, because the sale stages read
 * orders and nothing else. An organiser who reached a later stage another way (a claim with no message) counts there
 * and not at the stage skipped, so a step's rate can pass 100 percent, as in ./organiser-funnel-math.ts.
 *
 * Pure.
 */

export const ACQUISITION_STAGES = [
  'identified', 'qualified', 'contact_permitted', 'contacted', 'responded',
  'interested', 'ownership_verified', 'ticketing_activated', 'first_paid_sale', 'repeat_paid',
] as const
export type AcquisitionStage = (typeof ACQUISITION_STAGES)[number]

export const ACQUISITION_STAGE_WORDS: Readonly<Record<AcquisitionStage, string>> = {
  identified: 'Identified',
  qualified: 'Qualified',
  contact_permitted: 'Contact permitted',
  contacted: 'Contacted',
  responded: 'Responded',
  interested: 'Interested',
  ownership_verified: 'Ownership verified',
  ticketing_activated: 'Ticketing activated',
  first_paid_sale: 'First paid sale',
  repeat_paid: 'Repeat paid organiser',
}

/** What the funnel needs to know about one organiser, each read from its proving rows. */
export interface OrganiserStageFacts {
  readonly organiserId: string
  /** Their city (the city of most of their nights), or null when they have none. */
  readonly city: string | null
  /** The plan's who_first bucket of their open conversion opportunity, or null when none is recorded. */
  readonly group: string | null
  /** Where their opportunity was found, or null when none is recorded. */
  readonly source: string | null
  readonly nightsLastAndNext90: number
  readonly permittedContacts: number
  readonly touchesSent: number
  readonly replies: number
  readonly interestedReplies: number
  readonly ownershipVerified: boolean
  readonly paidTiers: number
  /** Distinct events of theirs with a paid EventLinqs order. */
  readonly paidEvents: number
}

/** The stages one organiser has reached, each from its own fact. */
export function stagesOf(f: OrganiserStageFacts): Set<AcquisitionStage> {
  const out = new Set<AcquisitionStage>(['identified'])
  if (f.nightsLastAndNext90 > 0) out.add('qualified')
  if (f.permittedContacts > 0) out.add('contact_permitted')
  if (f.touchesSent > 0) out.add('contacted')
  if (f.replies > 0) out.add('responded')
  if (f.interestedReplies > 0) out.add('interested')
  if (f.ownershipVerified) out.add('ownership_verified')
  if (f.paidTiers > 0) out.add('ticketing_activated')
  if (f.paidEvents > 0) out.add('first_paid_sale')
  if (f.paidEvents > 1) out.add('repeat_paid')
  return out
}

export interface AcquisitionStep {
  readonly stage: AcquisitionStage
  readonly words: string
  readonly organisers: number
  /** This stage's organisers over the stage before's, 0 to 1 or more; null for the first stage or after a stage of 0. */
  readonly fromBefore: number | null
}

/** The ten stages over a set of organisers, with the actual rate between each. */
export function acquisitionFunnel(rows: readonly OrganiserStageFacts[]): AcquisitionStep[] {
  const counts = new Map<AcquisitionStage, number>(ACQUISITION_STAGES.map((s) => [s, 0]))
  for (const r of rows) for (const s of stagesOf(r)) counts.set(s, (counts.get(s) ?? 0) + 1)
  return ACQUISITION_STAGES.map((stage, i) => {
    const here = counts.get(stage) ?? 0
    const before = i === 0 ? null : counts.get(ACQUISITION_STAGES[i - 1]) ?? 0
    return { stage, words: ACQUISITION_STAGE_WORDS[stage], organisers: here, fromBefore: before === null || before === 0 ? null : here / before }
  })
}

export type SplitBy = 'city' | 'group' | 'source'

/** The words for a missing city, group or source: said, never hidden or guessed. */
export const NOT_RECORDED = 'not recorded'

/** The funnel once per city, organiser group or source, largest first; a missing value is its own named row. */
export function funnelSplit(rows: readonly OrganiserStageFacts[], by: SplitBy): { key: string; steps: AcquisitionStep[] }[] {
  const groups = new Map<string, OrganiserStageFacts[]>()
  for (const r of rows) {
    const key = r[by] ?? NOT_RECORDED
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, list]) => ({ key, steps: acquisitionFunnel(list) }))
}
