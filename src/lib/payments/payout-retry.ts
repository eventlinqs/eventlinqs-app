/**
 * WHEN A FAILING ORGANISER TRANSFER MAY BE TRIED AGAIN, AND WHEN THE FOUNDER IS TOLD (1 November 2026).
 *
 * The case that set it: MKLStudios' transfer for one event failed every hour for 19 days, 448 times, each
 * 'exceeds_platform_balance: claimed 4914 > platform available 0', and nobody was told. Stripe's automatic payout
 * had paid the held money to the platform's bank a month before the event
 * (C:\dev\EVIDENCE\PAYOUT-MKL-1NOV\cause.md). An hourly retry cannot fix a cause like that; a person can.
 *
 * So: after FAILURES_BEFORE_HOLD failures in a row, the cron attempts that event at most once every HELD_RETRY_HOURS,
 * and the health sentinel raises a critical alarm (an email to the founder at once) for any event still owed money
 * whose last FAILURES_BEFORE_HOLD transfers failed. Pure functions: the cron and the sentinel read the rows and ask here.
 */

export const FAILURES_BEFORE_HOLD = 2
export const HELD_RETRY_HOURS = 24

export interface TransferAttempt {
  status: string
  created_at: string
  failure_reason?: string | null
}

function newestFirst(rows: TransferAttempt[]): TransferAttempt[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

function failuresInARow(rows: TransferAttempt[]): number {
  let n = 0
  for (const r of rows) {
    if (r.status !== 'failed') break
    n++
  }
  return n
}

export function retryVerdict(
  transfers: TransferAttempt[],
  now: Date,
): { attempt: boolean; consecutiveFailures: number; nextAttemptAt?: string } {
  const rows = newestFirst(transfers)
  const consecutiveFailures = failuresInARow(rows)
  if (consecutiveFailures < FAILURES_BEFORE_HOLD) return { attempt: true, consecutiveFailures }
  const next = Date.parse(rows[0].created_at) + HELD_RETRY_HOURS * 3_600_000
  if (now.getTime() >= next) return { attempt: true, consecutiveFailures }
  return { attempt: false, consecutiveFailures, nextAttemptAt: new Date(next).toISOString() }
}

export function owedAndFailing(input: {
  availableCents: number
  transfers: TransferAttempt[]
}): { alarm: boolean; consecutiveFailures: number; lastReason?: string } {
  const rows = newestFirst(input.transfers)
  const consecutiveFailures = failuresInARow(rows)
  if (input.availableCents <= 0 || consecutiveFailures < FAILURES_BEFORE_HOLD) return { alarm: false, consecutiveFailures }
  return { alarm: true, consecutiveFailures, lastReason: rows[0].failure_reason ?? undefined }
}
