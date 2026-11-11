import type { AcquisitionState } from '@/lib/outreach/acquisition-states'

/**
 * LAWAL'S PIPELINE, READ FROM PROOF (the Growth OS directive of 11 November 2026, PM order 4, Part 2 item 1: "The pipeline
 * as Lawal's directive and the 30 October state machine agree: Discovered, Qualified, Contact Ready, Contacted, Engaged,
 * Claimed, Ticketing Activated, First Sale, Recurring; plus Unresponsive, Not interested, Disqualified, Opted out").
 *
 * The 16 acquisition states stay exactly as the database decides them from proof (migration 20261030034001: "THE STATE
 * IS DERIVED FROM PROOF, NEVER TYPED"). This shows each one as Lawal's stage, and moves a record past Claimed only on the
 * transaction records the scorecard counts by (migration 20261101044501): TICKETING ACTIVATED is a public night ahead
 * with no outside ticket link and an active, visible, paid ticket tier; FIRST SALE is a paid order (confirmed or
 * partially refunded, above $0); RECURRING is paid orders in two or more months. A stage is never typed by a person.
 *
 * THE STAGE AND THE RIGHT TO WRITE ARE TWO FACTS. Opted out says no marketing may reach them; it is the stage only while
 * nothing else is proved. An organiser who unsubscribed and then sells tickets is a customer at First Sale, and still
 * receives no marketing (lawful communication status, read separately on the record).
 *
 * Pure.
 */

export const CRM_LINE = ['discovered', 'qualified', 'contact_ready', 'contacted', 'engaged', 'claimed', 'ticketing_activated', 'first_sale', 'recurring'] as const
export const CRM_SIDE = ['unresponsive', 'not_interested', 'disqualified', 'opted_out', 'removal_requested'] as const
export type CrmStage = (typeof CRM_LINE)[number] | (typeof CRM_SIDE)[number]

export const CRM_STAGE_WORDS: Readonly<Record<CrmStage, string>> = {
  discovered: 'Discovered',
  qualified: 'Qualified',
  contact_ready: 'Contact ready',
  contacted: 'Contacted',
  engaged: 'Engaged',
  claimed: 'Claimed',
  ticketing_activated: 'Ticketing activated',
  first_sale: 'First sale',
  recurring: 'Recurring',
  unresponsive: 'Unresponsive',
  not_interested: 'Not interested',
  disqualified: 'Disqualified',
  opted_out: 'Opted out',
  removal_requested: 'Removal requested',
}

/**
 * Each database state as Lawal's stage, with the reason. eligibility_checked is still Qualified (a lawful contact is
 * recorded, but no approved play holds them yet, so they are not ready to write to); claim_invited is still Engaged (a
 * claim is open, not yet verified); verified, media_approved, active and recurring are Claimed until the ticketing facts
 * move them on (their 'recurring' counts listed nights, Lawal's Recurring counts paid sales). disputed is shown as
 * Removal requested: an open removal request is handled before anything else. Disqualified has no proof in the database
 * yet; it is reached only when a disqualification is recorded (Release 1's tasks migration).
 */
export const FROM_ACQUISITION: Readonly<Record<AcquisitionState, CrmStage>> = {
  discovered: 'discovered',
  qualified: 'qualified',
  eligibility_checked: 'qualified',
  ready: 'contact_ready',
  contacted: 'contacted',
  engaged: 'engaged',
  claim_invited: 'engaged',
  verified: 'claimed',
  media_approved: 'claimed',
  active: 'claimed',
  recurring: 'claimed',
  suppressed: 'opted_out',
  rejected: 'not_interested',
  expired: 'unresponsive',
  disputed: 'removal_requested',
  withdrawn: 'not_interested',
}

export interface TicketingFacts {
  /** A public night ahead, no outside ticket link, an active, visible ticket tier above $0. */
  readonly ticketingActivated: boolean
  /** Paid orders (confirmed or partially refunded, above $0) on their events. */
  readonly paidOrders: number
  /** The distinct Melbourne months those paid orders fall in. */
  readonly paidMonths: number
}

export const NO_TICKETING: TicketingFacts = { ticketingActivated: false, paidOrders: 0, paidMonths: 0 }

export function crmStageOf(state: AcquisitionState, facts: TicketingFacts = NO_TICKETING): CrmStage {
  if (facts.paidOrders > 0) return facts.paidMonths >= 2 ? 'recurring' : 'first_sale'
  if (facts.ticketingActivated) return 'ticketing_activated'
  return FROM_ACQUISITION[state]
}

/** Where a stage sits on Lawal's line, for ordering a list; a side stage sorts after the line. */
export function stageRank(stage: CrmStage): number {
  const i = (CRM_LINE as readonly string[]).indexOf(stage)
  return i >= 0 ? i : CRM_LINE.length + (CRM_SIDE as readonly string[]).indexOf(stage)
}

/** The next action each stage asks for, in the founder's words: what moves the record on, never a guess at its outcome. */
export const NEXT_ACTION: Readonly<Record<CrmStage, string>> = {
  discovered: 'Find a night of theirs in the next 90 days, or set them aside',
  qualified: 'Record a lawful contact for them, then put them in an approved play',
  contact_ready: 'Approve their first message',
  contacted: 'Wait for their reply; the follow ups go on day 4 and day 10',
  engaged: 'Answer their reply and invite them to claim their nights',
  claimed: 'Help them put their next night on sale on EventLinqs',
  ticketing_activated: 'Send their partner kit and watch for the first sale',
  first_sale: 'Thank them and invite their next night',
  recurring: 'Keep them close and ask who else they know',
  unresponsive: 'Rest them, and write again later only with something new for them',
  not_interested: 'Write again later only with something new for them, unless they asked to be taken down',
  disqualified: 'Nothing: set aside',
  opted_out: 'Nothing: no message reaches them again',
  removal_requested: 'Resolve their removal request first',
}
