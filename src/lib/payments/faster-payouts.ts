/**
 * FASTER PAYOUTS FOR PROVEN ORGANISERS (window 6, 27 October 2026; the locked foundation's item 21; the rule and its
 * sources are supabase/migrations/20261027160001_faster_payouts.sql).
 *
 * An event's held funds are transferred once its end plus the platform's buffer has passed (pricing_rules
 * payout_schedule_days). For an organiser Lawal has switched on, who still qualifies at the moment of the run (the
 * database's faster_payout_check: Tier 3, five events, $50,000 lifetime gross, no dispute, a Stripe account paying out),
 * the buffer is the one Lawal set in their grant, never longer than the platform's. Everyone else is exactly as before.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export type FasterAnswer = { qualifies: boolean; bufferDays: number | null }

/** Whether an event's held funds are due now: past the platform's buffer, or past a qualifying organiser's own. */
export function dueForDisbursement(input: { endDate: string; now: Date; bufferDays: number; faster: FasterAnswer | null }): boolean {
  const ended = new Date(input.endDate).getTime()
  if (Number.isNaN(ended)) return false
  if (ended <= input.now.getTime() - input.bufferDays * DAY_MS) return true
  const f = input.faster
  if (!f || !f.qualifies || f.bufferDays === null) return false
  const buffer = Math.min(f.bufferDays, input.bufferDays)
  return ended <= input.now.getTime() - buffer * DAY_MS
}

/** The scan's cutoff: the platform's buffer, widened to the shortest live grant's so a qualifying event is found. */
export function scanCutoff(now: Date, bufferDays: number, grantBuffers: readonly number[]): string {
  const shortest = Math.min(bufferDays, ...grantBuffers)
  return new Date(now.getTime() - shortest * DAY_MS).toISOString()
}
