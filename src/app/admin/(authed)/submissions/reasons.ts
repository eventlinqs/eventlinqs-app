/** Why a person refused an organiser's submission; one of these, kept on the row. */
export const SUBMISSION_REFUSALS = [
  'Not an event',
  'Already listed',
  'Outside our cities',
  'The details are wrong',
  'The photo is not theirs to share',
  'Not for EventLinqs',
] as const
export type SubmissionRefusal = (typeof SUBMISSION_REFUSALS)[number]
