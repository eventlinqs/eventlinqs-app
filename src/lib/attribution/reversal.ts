import { RUNG, type AttributionDecision, type Rung } from './resolve'

/**
 * REVERSALS, AND WHAT BILLABLE MEANS.
 *
 * A fee billed on a reversed sale is worse than a fee missed. A missed fee is
 * money we did not collect; a billed one is a debt to the client plus the loss
 * of every number we show them afterwards. So this file is deliberately
 * conservative in the client's favour and says so.
 *
 * THE FOUR REASONS ARE THE FOUR GA3 NAMES, and no fifth was added even though
 * one looked tempting. An order that expired without payment is NOT a reversal:
 * nothing was taken back, because nothing happened. Writing a reversal row for
 * it would put a retraction in the ledger for a sale that never existed and
 * would make the reversal count meaningless as a measure of money handed back.
 * That case is excluded by the invoice view's join on the order state instead
 * (`marketing_attribution_invoice_ready`).
 *
 * A PARTIAL REFUND TAKES THE WHOLE SALE OFF THE INVOICE. Any reversal at all
 * makes an order not billable. Pro rating a fee against a partly refunded sale
 * would need a fee rate in this file, and the fee lives in exactly one place
 * that is not here. Conservative, defensible, and stated rather than discovered.
 *
 * THIS FILE IS PURE. It mirrors `public.marketing_attribution_is_billable`
 * clause for clause. The DATABASE is the authority, because the trigger there is
 * what actually writes the column and no application code can set it; this
 * exists so a caller can reason before writing and so the rule is unit testable,
 * and `tests/unit/growth/attribution-spine.test.ts` holds the two together.
 */

export const REVERSAL_REASON = {
  REFUND: 'refund',
  CHARGEBACK: 'chargeback',
  DUPLICATE: 'duplicate',
  MANUAL: 'manual',
} as const

export type ReversalReason = (typeof REVERSAL_REASON)[keyof typeof REVERSAL_REASON]

export const REVERSAL_REASON_SENTENCE: Record<ReversalReason, string> = {
  [REVERSAL_REASON.REFUND]: 'The buyer was refunded, so this sale is no longer chargeable.',
  [REVERSAL_REASON.CHARGEBACK]: 'The buyer disputed the payment and the money was taken back, so this sale is no longer chargeable.',
  [REVERSAL_REASON.DUPLICATE]: 'This order duplicates another sale, so it is not charged for twice.',
  [REVERSAL_REASON.MANUAL]: 'An administrator reversed this sale by hand, and the record names who.',
}

export function isReversalReason(value: string): value is ReversalReason {
  return (Object.values(REVERSAL_REASON) as string[]).includes(value)
}

/**
 * THE ORDER STATES A COMPLETED SALE CAN BE IN.
 *
 * Deliberately NOT `SOLD_STATUSES` from `src/lib/broadcast/sales-attribution.ts`,
 * and the difference is the point rather than an oversight. That constant
 * answers "how many tickets did this event sell", where a refunded ticket WAS
 * sold and counting it is right. This answers "may we charge a fee on this
 * sale", where a refunded ticket is money handed back. Importing the sales
 * definition here would have quietly billed every refund.
 */
export const COMPLETED_SALE_STATUSES = ['confirmed', 'partially_refunded'] as const

export function isCompletedSale(status: string): boolean {
  return (COMPLETED_SALE_STATUSES as readonly string[]).includes(status)
}

/**
 * What the reconciler owes for an order, read from the state lane A maintains.
 * Returns null when nothing is owed, which is the common case.
 */
export function reversalOwedForOrderState(order: {
  status: string
  refundedCents: number
  totalCents: number
}): { reason: ReversalReason; amountCents: number } | null {
  if (order.status === 'refunded') {
    return {
      reason: REVERSAL_REASON.REFUND,
      // A fully refunded order whose refund rows have not landed yet is still a
      // full reversal: the status is the fact, the rows are the paperwork.
      amountCents: order.refundedCents > 0 ? order.refundedCents : order.totalCents,
    }
  }
  if (order.status === 'partially_refunded' && order.refundedCents > 0) {
    return { reason: REVERSAL_REASON.REFUND, amountCents: order.refundedCents }
  }
  return null
}

/**
 * BILLABLE. The same two clauses as the database function, in the same order.
 */
export function isBillable(input: {
  decision: 'attributed' | 'none'
  rung: Rung
  reversalCount: number
}): boolean {
  if (input.decision !== 'attributed') return false
  if (input.rung > RUNG.RECIPIENT_IDENTITY) return false
  return input.reversalCount === 0
}

/** Convenience over a whole decision, for a caller that already has one. */
export function decisionIsBillable(decision: AttributionDecision, reversalCount: number): boolean {
  return isBillable({ decision: decision.decision, rung: decision.rung, reversalCount })
}
