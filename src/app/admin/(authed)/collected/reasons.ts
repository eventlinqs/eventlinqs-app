/** Why a person refused what the collection run found; one of these, so the register learns which sources mislead. */
export const REFUSAL_REASONS = [
  'Not an event',
  'Already listed',
  'Outside our cities',
  'The details are wrong',
  'Not for EventLinqs',
] as const
export type RefusalReason = (typeof REFUSAL_REASONS)[number]
