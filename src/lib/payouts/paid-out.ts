/**
 * PAID OUT IS ONE RULE (V3 item 8, the ledger; WINDOW 4's class of 1 November 2026, 06:40).
 *
 * A payout claim debits the ledger with reason 'payout'. When the transfer fails, void_payout (and its venue twin)
 * writes the compensating +adjustment with reference_type 'payout', so the money is held again. When a refund pulls a
 * transfer back from the connected account, reverseEventTransferForRefund writes a +adjustment marked
 * metadata.reversal_of_transfer. A settlement paid to the organiser outside the platform is a -adjustment marked
 * metadata.part 'paid-outside-the-platform' (MKLStudios, 1 November 2026, logged in PRODUCTION-WRITES.txt).
 *
 * Every reader that summed reason 'payout' alone counted a voided claim as money paid: MKLStudios' 448 failed hourly
 * claims, each voided, read as about A$22,019 paid out when A$54.00 was. So what a row says about money paid out is
 * decided here and nowhere else; the guard paid-out-is-one-rule fails the build where 'payout' rows are summed by hand.
 */

/** metadata.part of a settlement row paid to its owner outside the platform. */
export const SETTLED_OUTSIDE_PART = 'paid-outside-the-platform'

export interface PaidOutRow {
  reason: string
  delta_cents: number
  reference_type?: string | null
  /** metadata.reversal_of_transfer, as the ledger read returns it ('true', or true). */
  reversal_of_transfer?: string | boolean | null
  /** metadata.part. */
  settlement_part?: string | null
}

/** What this row adds to money paid out to the ledger's owner, in cents: positive paid, negative undone, 0 neither. */
export function paidOutCents(row: PaidOutRow): number {
  const delta = Number(row.delta_cents)
  if (!Number.isFinite(delta)) return 0
  if (row.reason === 'payout') return -delta
  if (row.reason !== 'adjustment') return 0
  if (row.reference_type === 'payout') return -delta
  if (row.reversal_of_transfer === true || row.reversal_of_transfer === 'true') return -delta
  if (row.settlement_part === SETTLED_OUTSIDE_PART) return -delta
  return 0
}

/** The PostgREST select fragment every ledger read that computes paid out must carry. */
export const PAID_OUT_SELECT =
  'reference_type, reversal_of_transfer:metadata->>reversal_of_transfer, settlement_part:metadata->>part'
