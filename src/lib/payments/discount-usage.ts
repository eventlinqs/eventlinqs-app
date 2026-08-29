import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * RECORDING THAT A DISCOUNT CODE WAS USED, on every path that can use one.
 *
 * WHAT WAS WRONG, found 29 August 2026.
 *
 *   1. This ran ONLY inside the free-order branch of checkout. A PAID order
 *      carrying a discount code recorded nothing at all, so `max_uses` and
 *      `max_uses_per_user` were unenforced on precisely the orders that cost
 *      money.
 *   2. It was gated on `user?.id`, so a GUEST checkout recorded nothing either,
 *      on any path.
 *   3. It called `increment_discount_uses`, a function that has never existed
 *      in this database (confirmed PGRST202 against TEST, and absent from every
 *      migration). Neither the insert nor the rpc had its error read, so all of
 *      it failed in silence.
 *
 * Net effect: discount_codes.current_uses was permanently 0, and the cap check
 * at validation time reads `current_uses >= max_uses`, so a code limited to N
 * uses could be redeemed without limit.
 *
 * WHAT THIS DOES NOT DO. It never fails the order. A buyer who has paid holds a
 * valid ticket, and refusing to confirm because a usage ledger row would not
 * write would turn an accounting problem into a customer-facing outage. It is
 * loud in the log instead, which is what was missing.
 *
 * The atomic cap lives in the SQL function (migration 20260829000001), not
 * here: two buyers redeeming the last use of a code at the same instant must be
 * resolved under a row lock, which application code cannot take.
 */

interface RecordDiscountUseArgs {
  /** Service-role client: this writes a ledger row the buyer may not own. */
  adminClient: SupabaseClient
  discount_code_id: string | null | undefined
  order_id: string
  /** Null for a guest checkout, which still consumes a use of the code. */
  user_id: string | null
  /** The guest's address, so a code used without an account is still attributable. */
  guest_email?: string | null
  /**
   * The reservation that HELD the use, when there was one.
   *
   * Present since migration 20260829000003: the use is claimed against the
   * reservation at checkout, so confirmation CONVERTS that hold rather than
   * incrementing again. Null for a path with no hold behind it (a squad
   * completion, or an order built before the migration landed), which falls
   * back to the direct increment.
   */
  reservation_id?: string | null
  discount_cents: number
}

export async function recordDiscountUse({
  adminClient,
  discount_code_id,
  order_id,
  user_id,
  guest_email = null,
  reservation_id = null,
  discount_cents,
}: RecordDiscountUseArgs): Promise<void> {
  if (!discount_code_id) return

  /*
   * THE LEDGER ROW IS THE IDEMPOTENCY KEY.
   *
   * discount_usages_unique_order UNIQUE (discount_code_id, order_id) has always
   * existed on this table, so a Stripe webhook redelivery inserting the same
   * pair is refused with 23505. That refusal is the signal that this order's
   * use was ALREADY counted, so the increment below must not run again. Without
   * this, every redelivery would burn another use of the buyer's code.
   *
   * The column is `discount_applied_cents`. The old call site wrote
   * `discount_amount_cents`, which does not exist on this table, so the insert
   * failed PGRST204 every time and its error was never read.
   */
  const { error: usageError } = await adminClient.from('discount_code_usages').insert({
    discount_code_id,
    order_id,
    user_id,
    guest_email,
    discount_applied_cents: discount_cents,
  })

  if (usageError) {
    if (usageError.code === '23505') {
      // Already recorded for this order. Correct and expected on a redelivery.
      return
    }
    console.error('[discount-usage] could not record the usage row, so the cap was NOT advanced', {
      order_id,
      discount_code_id,
      pg_code: usageError.code,
      message: usageError.message,
    })
    return
  }

  /*
   * CONVERT THE HOLD FIRST, and only increment directly if there was no hold.
   *
   * Since migration 20260829000003 the use is CLAIMED when the code is applied
   * to the reservation, not here. So on the ordinary path the work at this point
   * is to turn that hold into a confirmed use: reserved_uses down, current_uses
   * up, claim row gone, in one statement.
   *
   * Calling increment_discount_uses as well would count the same redemption
   * TWICE, once as a hold that was already deducted from the cap and once as a
   * fresh increment, which would exhaust an organiser's code at half its stated
   * limit. So the two are alternatives, never both.
   *
   * The direct increment stays as the fallback for an order that carries a
   * discount with NO reservation hold behind it: a squad completion, an order
   * built before this migration was applied, or any path that reaches
   * confirmation without having gone through the checkout claim.
   * convert_discount_claim returns FALSE when nothing was held, which is exactly
   * the signal for that.
   */
  let claimed: boolean | null = null
  let claimError: { code?: string; message: string } | null = null

  if (reservation_id) {
    const converted = await adminClient.rpc('convert_discount_claim', {
      p_reservation_id: reservation_id,
    })
    if (converted.error) {
      claimError = converted.error
    } else if (converted.data === true) {
      claimed = true
    }
  }

  if (claimed === null && !claimError) {
    const direct = await adminClient.rpc('increment_discount_uses', {
      p_code_id: discount_code_id,
    })
    claimed = direct.data as boolean | null
    claimError = direct.error
  }

  if (claimError) {
    console.error('[discount-usage] increment_discount_uses failed: the code cap is NOT being enforced', {
      order_id,
      discount_code_id,
      pg_code: claimError.code,
      message: claimError.message,
      hint:
        claimError.code === 'PGRST202'
          ? 'The function does not exist on this database. Apply migration 20260829000001_missing_increment_functions.sql.'
          : undefined,
    })
    return
  }

  // FALSE means the row was not updated: the code was already at its cap, or is
  // inactive, or is gone. The order stands, but this is worth seeing.
  if (claimed === false) {
    console.warn('[discount-usage] a use was NOT claimed: the code is exhausted, inactive or missing', {
      order_id,
      discount_code_id,
    })
  }
}
