/**
 * WHICH STRIPE EVENTS MEAN "A REFUND SUCCEEDED". Close-out R1.
 *
 * WHY THIS MODULE EXISTS, and the first thing to say is that the alarm that
 * produced it was WRONG about the platform and right about the design.
 *
 * THE ALARM. On 14 September 2026 a session refunded a real payment intent from
 * outside the application and read the server's log for `charge.refunded`, the
 * only event this route reached its successful-refund handler from. It found
 * `refund.created` and `charge.refund.updated` in the unhandled branch and no
 * mention of `charge.refunded`, and concluded that a refund made from the Stripe
 * Dashboard was being dropped in silence.
 *
 * WHAT DRIVING IT ESTABLISHED. `charge.refunded` WAS being sent and WAS being
 * handled. It printed nothing naming itself, so its silence was identical to its
 * absence, which is the shape of the mistake rather than an excuse for it. Asked
 * of Stripe rather than of a log, one refund created through the Refunds API on
 * API version 2026-02-25.clover emitted FOUR events (account event record,
 * 14 September 2026):
 *
 *     refund.created         evt_3UFPVkGuiZ9cvxuu050bWjLt
 *     charge.refunded        evt_3UFPVkGuiZ9cvxuu0CQbFvLY
 *     refund.updated         evt_3UFPVkGuiZ9cvxuu0YtdvGNQ
 *     charge.refund.updated  evt_3UFPVkGuiZ9cvxuu0fZSEn6e   (deprecated)
 *
 * So the platform was not losing dashboard refunds. The case for this module is
 * the one that survives that correction, and it is Stripe's own: the integration
 * was resting its entire successful-refund path on the ONE refund event Stripe's
 * documentation points AWAY from, with nothing anywhere noticing if that
 * delivery ever stopped, and the route now says which event it acted on so the
 * same silence cannot be misread again.
 *
 * WHAT STRIPE PUBLISHES, quoted rather than remembered
 * (https://docs.stripe.com/refunds, "Refund events", fetched 14 September 2026):
 *
 *   "At a minimum, Stripe recommends that you listen for the `refund.created`
 *    event."
 *   `refund.created`         "Sent when a refund is created."
 *   `charge.refunded`        "Sent when a charge is refunded, including partial
 *                             refunds. Listen to `refund.created` for
 *                             information about the refund."
 *   `refund.updated`         "Sent when the refund is updated."
 *   `refund.failed`          "Sent when a refund has failed."
 *   `charge.refund.updated`  "(Deprecated) ... Listen to `refund.updated` for
 *                             updates on all refunds instead."
 *
 * So `charge.refunded` is NOT deprecated and may still arrive, and
 * `refund.created` is the one Stripe names as the minimum. Both are doors, which
 * is the whole reason the reconcile has to be idempotent: two deliveries for one
 * refund must return the seat ONCE. The latch is in the database, not here -
 * `reconcile_refund` returns `already_done` when the refunds row is already
 * `completed` (supabase/migrations/20260820000003_refund_releases_squad_seat.sql)
 * and the route runs the side effects only on `reconciled`.
 *
 * WHY THE DECISION IS A PURE MODULE RATHER THAN A SWITCH STATEMENT ALONE. A
 * switch cannot be enumerated by a test or a guard without parsing TypeScript,
 * and the thing most worth defending is not the code that runs but the SET of
 * events it runs for: that set shrank to one silently once already. Here it can
 * be read by the route, asserted exhaustively by a test, checked against the
 * Stripe endpoint's own subscription list, and drilled by a registered guard.
 */

/** The Stripe event every integration must listen to, in Stripe's own words. */
export const STRIPE_MINIMUM_REFUND_EVENT = 'refund.created' as const

/**
 * Every event that means "this refund went through, reconcile it". Both are
 * documented and either may arrive first, so the handler for each must be
 * idempotent against the other.
 */
export const REFUND_SUCCESS_EVENTS = ['refund.created', 'charge.refunded'] as const

/**
 * Events that mean "this refund did NOT complete" and route to the alert path.
 * `refund.updated` sits here because a CANCELLED refund arrives as a status
 * change rather than as `refund.failed`, and its handler returns without a write
 * for every status still on its way to succeeding.
 */
export const REFUND_NOT_COMPLETED_EVENTS = ['refund.failed', 'refund.updated'] as const

/**
 * Deprecated on Stripe's own page. Subscribing to one of these instead of the
 * current event is how an integration ends up listening to something Stripe is
 * winding down, so nothing here may reach the success path.
 */
export const DEPRECATED_REFUND_EVENTS = [
  'charge.refund.updated',
  'source.refund_attributes_required',
] as const

export type RefundEventRole = 'success' | 'not-completed' | 'deprecated' | null

/**
 * What a Stripe event type means for a refund, or null when it is not a refund
 * event at all. Total over the strings Stripe can send, because an unknown type
 * must answer null rather than throw: the route sees every event on the
 * endpoint, not only the ones this module names.
 */
export function classifyRefundEvent(type: string): RefundEventRole {
  if ((REFUND_SUCCESS_EVENTS as readonly string[]).includes(type)) return 'success'
  if ((REFUND_NOT_COMPLETED_EVENTS as readonly string[]).includes(type)) return 'not-completed'
  if ((DEPRECATED_REFUND_EVENTS as readonly string[]).includes(type)) return 'deprecated'
  return null
}

/**
 * A Stripe Refund carries its charge either as an id, as an expanded object, or
 * not at all; when it is absent the payment intent is the way back to the
 * charge. Pinned here and tested exhaustively because it is the one piece of
 * real logic on the `refund.created` path, and a wrong answer means a refund
 * that is received and then dropped - the same silence R1 is about.
 *
 * Returns the charge id where the refund names one directly, otherwise the
 * payment intent id to retrieve it from, otherwise neither.
 */
export function refundChargeSource(refund: {
  charge?: string | { id?: string } | null
  payment_intent?: string | { id?: string } | null
}): { chargeId: string | null; paymentIntentId: string | null } {
  const chargeId =
    typeof refund.charge === 'string'
      ? refund.charge
      : (refund.charge?.id ?? null)
  const paymentIntentId =
    typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : (refund.payment_intent?.id ?? null)
  return { chargeId: chargeId || null, paymentIntentId: paymentIntentId || null }
}
