/**
 * WHAT THE ORGANISER SEES AFTER A REFUND HAS BEEN ISSUED.
 *
 * THE DEFECT THIS CLOSES, found on production on 21 August 2026 by refunding a
 * real order. After a successful refund the page showed the refund dialog's EMPTY
 * state: "There are no refundable tickets on this order." That sentence is true
 * for an order that never had refundable tickets and actively misleading as the
 * first thing somebody reads after refunding one. The founder had to check an
 * email and then a bank statement to learn whether it had worked, and an
 * organiser who is unsure is an organiser who presses Refund again.
 *
 * The empty state and the success state are now different components saying
 * different things. This one is only rendered when a refund actually exists, so
 * it can state the amount, that the buyer was told, and when the money lands.
 *
 * THE TIMING IS SOURCED, not estimated. Stripe's own refunds documentation:
 * "Your customer sees the refund as a credit approximately 5-10 business days
 * later, depending upon the bank." (https://docs.stripe.com/refunds, fetched
 * 21 August 2026.) The same page explains the reversal case, which is why it is
 * mentioned below: a refund issued shortly after the charge "appear[s] in the
 * form of a reversal instead of a refund. In the case of a reversal, the original
 * charge drops off the customer's statement, and a separate credit isn't issued."
 * An organiser who does not know that will read a vanished charge as a failure.
 */

export type RefundOutcomeRow = {
  id: string
  amount_cents: number
  currency: string
  status: string
  created_at: string
}

function formatCents(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  })
}

/** Terminal states worth reporting separately from "on its way". */
const SETTLED = new Set(['completed'])
const IN_FLIGHT = new Set(['pending', 'processing'])

export function RefundOutcome({
  refunds,
  buyerEmail,
}: {
  refunds: RefundOutcomeRow[]
  buyerEmail: string
}) {
  if (refunds.length === 0) return null

  const settled = refunds.filter((r) => SETTLED.has(r.status))
  const inFlight = refunds.filter((r) => IN_FLIGHT.has(r.status))
  const failed = refunds.filter((r) => r.status === 'failed' || r.status === 'cancelled')

  const totalRefunded = [...settled, ...inFlight].reduce((s, r) => s + r.amount_cents, 0)
  const currency = refunds[0].currency
  const latest = refunds[0]

  const heading = failed.length > 0 && settled.length === 0 && inFlight.length === 0
    ? 'Refund did not go through'
    : inFlight.length > 0 && settled.length === 0
      ? 'Refund in progress'
      : 'Refunded'

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-ink-900">{heading}</h2>
        <span className="text-lg font-bold text-ink-900">{formatCents(totalRefunded, currency)}</span>
      </div>

      {failed.length > 0 && settled.length === 0 && inFlight.length === 0 ? (
        <p className="mt-2 text-sm text-ink-600">
          The card issuer could not process this refund and the money has been returned to the
          platform balance. Arrange another way to pay the buyer back, then record it here.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-600">
            {inFlight.length > 0 && settled.length === 0
              ? 'The refund has been sent to the buyer’s bank and is being processed.'
              : 'The refund has been issued to the original payment method.'}
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-600">
            <li className="flex justify-between gap-4">
              <span>Amount refunded</span>
              <span className="font-medium text-ink-900">{formatCents(totalRefunded, currency)}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Buyer notified</span>
              <span className="font-medium text-ink-900">{buyerEmail || 'by email'}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Issued</span>
              <span className="font-medium text-ink-900">{formatWhen(latest.created_at)}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Reaches their statement</span>
              <span className="font-medium text-ink-900">in about 5 to 10 business days</span>
            </li>
          </ul>

          <p className="mt-4 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-400">
            Timing is the issuing bank&apos;s, not ours. If the refund was issued soon after the
            purchase, the buyer may see the original charge disappear from their statement
            rather than a separate credit. Either way the money is on its way back to them, and
            there is nothing further for you to do.
          </p>
        </>
      )}

      {refunds.length > 1 && (
        <p className="mt-4 text-xs text-ink-400">
          {refunds.length} refunds have been issued against this order.
        </p>
      )}
    </div>
  )
}
