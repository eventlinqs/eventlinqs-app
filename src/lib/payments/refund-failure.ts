import { RefundRequestError } from './refund-service'

/**
 * WHAT AN ORGANISER IS TOLD WHEN A REFUND WILL NOT GO THROUGH.
 *
 * FOUNDER RULING 18 August 2026: "Never expose Stripe internals to an organiser;
 * a failure says what happened and what to do, in plain words."
 *
 * Before this module both refund actions ended with
 *
 *   return { ok: false, error: err instanceof Error ? err.message : '...' }
 *
 * and that message went straight into the refund dialog. So an organiser could be
 * shown, verbatim:
 *
 *   "order not refundable in status pending"        a database status enum
 *   "no payment intent for order"                   an internal payments concept
 *   "one or more tickets are not refundable or already claimed"
 *   "Charge ch_3U5mGQGqHIQtgS8t0KKuTQVr has already been refunded."   Stripe, with an id
 *
 * None of those tells an organiser what to DO, and the last one hands them a
 * Stripe object id for a system they have no account on. Worse, an organiser who
 * reads "no payment intent" reasonably concludes the platform lost their money.
 *
 * SO EVERY FAILURE IS TRANSLATED, and the translation always has two halves: what
 * happened, and the next action. A message that only names the problem still
 * leaves somebody stuck.
 *
 * THE RAW DETAIL IS NOT DISCARDED, it is redirected. The caller keeps logging the
 * original to the audit log and to Sentry, which is where an engineer looks. The
 * organiser gets the sentence; the diagnosis stays where it is useful.
 *
 * CLASSIFICATION READS A CODE WHERE ONE EXISTS. Stripe errors carry `type` and
 * `code`, and the refund RPCs raise with explicit SQLSTATEs, so those are matched
 * first. Message matching is used only for our OWN migration-authored messages,
 * where several refusals deliberately share ERRCODE check_violation. That is a
 * different thing from parsing a vendor's prose: those strings live in
 * supabase/migrations/20260531000001_refund_reconcile.sql, under our control, and
 * `unknown` is a safe landing for anything unrecognised.
 */

export interface OrganiserRefundFailure {
  /** Plain-words sentence for the organiser. Never contains an id or a vendor name. */
  message: string
  /**
   * A stable machine tag for logs and tests. Not shown to the organiser, and
   * deliberately not derived from the vendor's own code so a vendor rename cannot
   * silently change our taxonomy.
   */
  reason:
    | 'not_authorised'
    | 'no_tickets_selected'
    | 'already_refunded'
    | 'order_not_refundable'
    | 'free_order'
    | 'no_payment_found'
    | 'amount_invalid'
    | 'payment_provider_declined'
    | 'temporarily_unavailable'
    | 'unknown'
}

/** Shape of a Stripe SDK error, read without importing the SDK into this module. */
interface StripeLikeError {
  type?: unknown
  code?: unknown
  statusCode?: unknown
  message?: unknown
}

function asStripeError(err: unknown): StripeLikeError | null {
  if (typeof err !== 'object' || err === null) return null
  const e = err as StripeLikeError
  // Every Stripe SDK error sets `type` to a StripeXxxError string. Checking that
  // rather than instanceof keeps this module free of the Stripe import, so it can
  // be unit tested without constructing real SDK errors.
  return typeof e.type === 'string' && e.type.startsWith('Stripe') ? e : null
}

/**
 * Translate any thrown refund error into what the organiser should read.
 *
 * @param err the caught error, of any shape
 */
export function toOrganiserRefundFailure(err: unknown): OrganiserRefundFailure {
  // ---- Stripe, the case the ruling names explicitly -------------------------
  const stripe = asStripeError(err)
  if (stripe) {
    const code = typeof stripe.code === 'string' ? stripe.code : ''

    if (code === 'charge_already_refunded') {
      return {
        reason: 'already_refunded',
        message:
          'These tickets have already been refunded. Reload the order to see its current state. '
          + 'If the buyer says they have not received the money, it can take up to 10 business days '
          + 'to appear on their statement.',
      }
    }
    if (code === 'balance_insufficient') {
      return {
        reason: 'payment_provider_declined',
        message:
          'This refund could not be completed right now because of a temporary problem settling the '
          + 'payment. Nothing has been charged or refunded. Try again in a few minutes, and contact '
          + 'EventLinqs support if it keeps happening.',
      }
    }
    // A 429 or a 5xx from the provider is worth retrying; an organiser should not
    // be told to change anything, because nothing they control is wrong.
    if (stripe.statusCode === 429 || (typeof stripe.statusCode === 'number' && stripe.statusCode >= 500)) {
      return {
        reason: 'temporarily_unavailable',
        message:
          'The payment system is busy and did not respond in time. No refund has been sent. '
          + 'Wait a minute and try again.',
      }
    }
    return {
      reason: 'payment_provider_declined',
      message:
        'The payment system would not process this refund. No money has moved. '
        + 'Reload the order and try again, and contact EventLinqs support if it happens twice.',
    }
  }

  // ---- Our own RPC refusals ------------------------------------------------
  if (err instanceof RefundRequestError) {
    const m = err.message

    if (err.code === '42501' || /not authorised/i.test(m)) {
      return {
        reason: 'not_authorised',
        message:
          'You are not authorised to refund this order. Ask an owner or a manager of this '
          + 'organisation to refund it, or to give you manager access.',
      }
    }
    if (/no tickets selected/i.test(m)) {
      return {
        reason: 'no_tickets_selected',
        message: 'Choose at least one ticket to refund, then try again.',
      }
    }
    if (/already claimed|not refundable or already claimed/i.test(m)) {
      return {
        reason: 'already_refunded',
        message:
          'At least one of those tickets has already been refunded, or a refund on it is still being '
          + 'processed. Reload the order to see which tickets are still refundable.',
      }
    }
    if (/free orders are not refundable/i.test(m)) {
      return {
        reason: 'free_order',
        message: 'This is a free order, so there is nothing to refund. To stop the ticket admitting at the door, cancel it instead.',
      }
    }
    if (/order not refundable in status/i.test(m)) {
      return {
        reason: 'order_not_refundable',
        message:
          'This order cannot be refunded because its payment is not complete. Only a confirmed, paid '
          + 'order can be refunded. If the buyer was charged, reload in a minute: the payment may still be settling.',
      }
    }
    if (/no payment intent for order/i.test(m)) {
      return {
        reason: 'no_payment_found',
        message:
          'No completed payment is recorded against this order, so there is nothing to refund. '
          + 'If the buyer has a receipt, contact EventLinqs support with the order number and we will trace it.',
      }
    }
    if (/zero face value|amount must be positive/i.test(m)) {
      return {
        reason: 'amount_invalid',
        message:
          'The refund amount for those tickets works out to nothing, so no refund was sent. '
          + 'Contact EventLinqs support with the order number.',
      }
    }
    if (/order not found/i.test(m)) {
      return {
        reason: 'order_not_refundable',
        message: 'That order could not be found. Reload the orders list, as it may have been changed in another tab.',
      }
    }
  }

  // ---- Anything else -------------------------------------------------------
  // Deliberately says nothing about the cause: an unrecognised error is exactly
  // the case where guessing at a cause would mislead. The raw error is in the
  // logs, and the organiser is given the one action that always applies.
  return {
    reason: 'unknown',
    message:
      'This refund could not be completed. No money has moved. Reload the order and try again, '
      + 'and contact EventLinqs support with the order number if it happens again.',
  }
}
