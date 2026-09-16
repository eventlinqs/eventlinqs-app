import { ACCEPTED_PAYMENT_METHODS } from '@/lib/payments/payment-methods'

/**
 * THE "WE ACCEPT" STRIP, ONE IMPLEMENTATION, READ FROM THE DECLARATION.
 *
 * Close-out SEO4 step 5. It was a typed list inside `CheckoutTrustSignals`, and
 * a second, different typed list inside the /pricing FAQ answer. It is now one
 * component over `src/lib/payments/payment-methods.ts`, so the event page, the
 * checkout and the marketing pages cannot disagree about what a buyer can pay
 * with, and adding a method is one line in one file.
 *
 * NO THIRD-PARTY BRAND ASSETS, which is the rule `CheckoutTrustSignals` already
 * carried and the reason this renders names rather than logos: shipping Visa and
 * Mastercard marks means bundling artwork under somebody else's trademark usage
 * terms, and the names carry the same information at no legal or byte cost.
 *
 * The separators are `aria-hidden` because a middle dot is punctuation, not a
 * payment method, and a screen reader announcing "Visa, interpunct, Mastercard"
 * is reading the layout to somebody instead of the list.
 */
export function AcceptedPaymentMethods({
  heading = 'We accept',
  className = '',
}: {
  heading?: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">{heading}</p>
      <ul
        role="list"
        aria-label="Accepted payment methods"
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-600"
      >
        {/*
          THE SEPARATOR IS ITS OWN `li`, and `display: contents` was tried and
          rejected. Wrapping the dot and the label in one `li` with
          `className="contents"` is the tidier markup and it is known to drop the
          element from the accessibility tree in several browsers, which would
          turn a five-item list into an empty one for exactly the users who
          cannot see the dots anyway. This is the structure CheckoutTrustSignals
          already shipped with, kept deliberately.
        */}
        {ACCEPTED_PAYMENT_METHODS.map((method, i) => [
          i > 0 ? (
            <li key={`${method.id}-sep`} aria-hidden className="text-ink-200">
              ·
            </li>
          ) : null,
          <li key={method.id}>{method.label}</li>,
        ])}
      </ul>
    </div>
  )
}
