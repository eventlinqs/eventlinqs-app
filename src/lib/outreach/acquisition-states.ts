/**
 * THE ACQUISITION STATES, AS A SCREEN SAYS THEM (window 6, 30 October 2026). The database decides each organiser's state
 * from its proof (supabase/migrations/20261030034001_organiser_acquisition_state.sql); this is only its list, in its
 * order, and the words for each. tests/unit/outreach/acquisition-states.test.ts holds the list to the migration's.
 * Pure.
 */

export const ACQUISITION_STATES = [
  'discovered',
  'qualified',
  'eligibility_checked',
  'ready',
  'contacted',
  'engaged',
  'claim_invited',
  'verified',
  'media_approved',
  'active',
  'recurring',
  'suppressed',
  'rejected',
  'expired',
  'disputed',
  'withdrawn',
] as const
export type AcquisitionState = (typeof ACQUISITION_STATES)[number]

export const STATE_WORDS: Readonly<Record<AcquisitionState, string>> = {
  discovered: 'Discovered',
  qualified: 'Qualified: a night in the next 90 days',
  eligibility_checked: 'Lawful basis recorded',
  ready: 'Ready: in an approved play',
  contacted: 'Contacted',
  engaged: 'Replied with interest',
  claim_invited: 'Invited to claim',
  verified: 'Claimed and verified',
  media_approved: 'Said yes to their material',
  active: 'Active: a night ahead',
  recurring: 'Recurring: nights in two months or more',
  suppressed: 'Suppressed: stopped, bounced or unsubscribed',
  rejected: 'Said no',
  expired: 'No reply after three messages',
  disputed: 'A removal request is open',
  withdrawn: 'Withdrawn: a take down, or every yes withdrawn',
}

export function isAcquisitionState(value: string): value is AcquisitionState {
  return (ACQUISITION_STATES as readonly string[]).includes(value)
}
