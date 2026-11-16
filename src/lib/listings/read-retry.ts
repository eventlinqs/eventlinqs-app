/**
 * A PASSING FAULT IS READ AGAIN, NEVER HELD FOR A PERSON (16 November 2026). H2o New Year's Eve, an organiser's own
 * submission Lawal approved, was held at 13:11 because nyeh2o.com.au did not answer within 12 seconds
 * (src/lib/listings/booking-page.ts): one slow minute turned a live listing into a person's task. A booking page that
 * timed out or could not be reached leaves the submission waiting, and the next self-listing run (each hour) reads it
 * again; only after READ_TRIES reads that fail the same way is it held, with that reason. A page that answered is judged
 * at once as before. Pure: src/lib/listings/self-listing-run.ts writes what it decides.
 */
export const READ_TRIES = 3

/** The reasons readBookingPage gives for a page it could not read at all, as opposed to what a page said. */
const PASSING = ['the page did not answer in time', 'the page could not be reached'] as const

export function readAgain(reading: { ok: boolean; reason?: string }, checkResult: Record<string, unknown> | null | undefined): { again: false } | { again: true; tries: number } {
  if (reading.ok || !PASSING.includes((reading.reason ?? '') as (typeof PASSING)[number])) return { again: false }
  const before = typeof checkResult?.read_tries === 'number' ? checkResult.read_tries : 0
  const tries = before + 1
  return tries < READ_TRIES ? { again: true, tries } : { again: false }
}
