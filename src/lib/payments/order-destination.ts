import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChargePreconditionError } from './application-fee'
import { estimateStripeProcessingCents } from './stripe-processing-estimate'

/**
 * WHERE AN ORDER'S MONEY IS OWED, WRITTEN DOWN AT CHARGE TIME (MONEY FIX A4).
 *
 * ============================================================================
 * THE FAILURE THIS EXISTS TO END
 * ============================================================================
 *
 * On 10 September 2026 two ticket charges for the Afro-Fusion Music Showcase
 * settled into the platform account and Stripe paid A$52.15 of it out to the
 * platform owner's personal bank. The organiser's connected account was live,
 * enabled, and had been created by this platform, which had also stored the
 * organisation id on it. None of that helped, because NOTHING ANYWHERE RECORDED
 * THAT THOSE TWO ORDERS WERE OWED ONWARD TO ANYBODY. Working out who was owed
 * what meant reading Stripe by hand and matching charges against the catalogue.
 *
 * Under the funds-holding model the platform is the merchant of record and the
 * money is SUPPOSED to settle to the platform balance, so no Stripe field can
 * carry this fact. It has to be ours, and it has to be written at the moment it
 * is known, which is the moment the charge is composed.
 *
 * ============================================================================
 * FOUR FACTS, WRITTEN TOGETHER OR NOT AT ALL
 * ============================================================================
 *
 * A4 names four: the destination account, the platform fee retained, the Stripe
 * processing estimate, and the amount due to the organiser. Three of them are
 * arithmetic over one another and the fourth is an identifier, so a row carrying
 * SOME of them is worse than a row carrying none: it reads as a complete record
 * and is not one. `orders_destination_is_whole` refuses the partial state in the
 * database, not merely here.
 *
 * BEFORE THE CHARGE, NOT AFTER IT. The caller writes this and only then asks
 * Stripe for a PaymentIntent, so a record that cannot be written means there is
 * no charge, rather than a charge nobody can attribute. An intent that is
 * created and never confirmed costs nobody anything; a charge with no
 * destination cost a real organiser A$52.48 and three days of not knowing.
 */

/** What the caller knows at charge time. */
export interface OrderDestinationInput {
  /** The order the money belongs to. */
  orderId: string
  /** The connected account it is owed onward to. */
  connectedAccountId: string
  /** What the buyer is charged, in cents. */
  totalCents: number
  /** What the organiser is owed, as the fee composition computed it. */
  organiserAmountDueCents: number
  /** The settlement currency, for the processing estimate. */
  currency: string
}

/** Exactly the columns written, so the caller and the test read one list. */
export interface OrderDestinationRow {
  destination_account_id: string
  platform_fee_retained_cents: number
  stripe_processing_estimate_cents: number | null
  organiser_amount_due_cents: number
  destination_recorded_at: string
}

/**
 * The row, composed. Pure, so the arithmetic is testable without a database.
 *
 * THE RETAINED AMOUNT IS DERIVED, NEVER PASSED IN. It is what is left of the
 * charge after the organiser's share, which is the only definition that cannot
 * disagree with the two numbers beside it. Passing it would make three
 * independent figures where there are two.
 */
export function composeOrderDestination(
  input: OrderDestinationInput,
  now: Date = new Date(),
): OrderDestinationRow {
  const retained = input.totalCents - input.organiserAmountDueCents
  if (!Number.isFinite(retained) || retained < 0) {
    throw new ChargePreconditionError(
      'destination_not_recorded',
      `Order ${input.orderId} would owe the organiser ${input.organiserAmountDueCents}c out of a ${input.totalCents}c charge, which leaves the platform ${retained}c. There is no honest record to write.`,
    )
  }
  if (!input.connectedAccountId) {
    throw new ChargePreconditionError(
      'destination_not_recorded',
      `Order ${input.orderId} has no destination connected account to record.`,
    )
  }
  return {
    destination_account_id: input.connectedAccountId,
    platform_fee_retained_cents: retained,
    stripe_processing_estimate_cents: estimateStripeProcessingCents(input.totalCents, input.currency),
    organiser_amount_due_cents: input.organiserAmountDueCents,
    destination_recorded_at: now.toISOString(),
  }
}

/**
 * Write it, and refuse by name if it cannot be written.
 *
 * THE ROW COUNT IS ASSERTED, NOT THE ABSENCE OF AN ERROR. An UPDATE that matches
 * nothing succeeds: PostgREST returns no error and zero rows, and a charge would
 * then be created against an order that carries no destination while this
 * function reported success. That is the same silence the whole item is about,
 * so the write asks for the ids back and insists on exactly one.
 */
export async function recordOrderDestination(
  input: OrderDestinationInput,
  client?: SupabaseClient,
  now: Date = new Date(),
): Promise<OrderDestinationRow> {
  const row = composeOrderDestination(input, now)
  const admin = client ?? createAdminClient()
  const { data, error } = await admin.from('orders').update(row).eq('id', input.orderId).select('id')

  if (error) {
    throw new ChargePreconditionError(
      'destination_not_recorded',
      `Could not record where order ${input.orderId} is owed: ${error.message}`,
    )
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new ChargePreconditionError(
      'destination_not_recorded',
      `Recording where order ${input.orderId} is owed matched ${Array.isArray(data) ? data.length : 0} row(s), not 1.`,
    )
  }
  return row
}
