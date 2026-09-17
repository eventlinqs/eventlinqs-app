/**
 * WHAT A BUYER CAN PAY WITH, DECLARED ONCE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * Close-out SEO4 step 5: "Show the accepted payment methods on the event page,
 * read from the payment configuration rather than typed, because the audit found
 * they are named nowhere on the attendee path and only on the organiser pricing
 * page."
 *
 * The audit understated it. There were TWO typed lists and they did not agree:
 *
 *   src/components/features/checkout/CheckoutTrustSignals.tsx   five methods
 *   src/components/templates/PricingPage.tsx (the FAQ answer)   six, adding Link
 *
 * Two hand-written lists in one repository disagreeing about what a buyer can
 * pay with is the exact failure a single declaration prevents, and it had already
 * happened before anybody asked for one.
 *
 * ============================================================================
 * WHY THIS IS A DECLARATION AND NOT A READ FROM STRIPE, STATED PLAINLY
 * ============================================================================
 *
 * `src/lib/payments/stripe-adapter.ts` creates every payment intent with
 * `automatic_payment_methods: { enabled: true }`. That means STRIPE decides what
 * a given buyer is offered, from the methods activated on the platform account
 * and from the buyer's own device and currency, and the authoritative answer
 * lives in the Stripe dashboard rather than in this repository.
 *
 * Reading it back means a Stripe API call, and the Stripe call is lane A's by
 * the three-lane protocol, so it is NOT done here. It is raised as a BORDER in
 * REVIEW-QUEUE-C.md with the endpoint named, so the upgrade is one small change
 * by whoever owns that path rather than a rediscovery.
 *
 * WHAT THIS LIST THEREFORE IS: the platform's PUBLISHED COMMITMENT about what it
 * accepts, in one place, so that every surface says the same thing and a change
 * is one edit. It is deliberately the set both existing surfaces already agreed
 * on, because a buyer-facing claim that only one of two internal lists supported
 * is not a claim anybody verified.
 *
 * STRIPE LINK IS NOT ON THE LIST, AND THAT IS THE ONE JUDGEMENT HERE. It appears
 * in the /pricing FAQ answer and in neither the checkout panel nor anywhere the
 * platform configures. Whether it is enabled on the account is a dashboard fact
 * this lane cannot read, so naming it to a buyer would be an UNSOURCED claim
 * about money. It is left off until the live read exists or somebody confirms
 * the dashboard, and this paragraph is how a reader learns it was considered
 * rather than forgotten.
 *
 * ============================================================================
 * WHY A `kind` RATHER THAN JUST NAMES
 * ============================================================================
 *
 * A wallet and a card are different promises. "Apple Pay" is only offered on a
 * device that has it, so a surface that wants to say "cards, plus Apple Pay and
 * Google Pay where your device supports them" can compose that sentence from the
 * data instead of writing a second list to say it. Nothing today depends on the
 * distinction; it exists so the next surface does not have to re-type the list
 * to make it.
 */

export type PaymentMethodKind = 'card' | 'wallet'

export interface AcceptedPaymentMethod {
  /** Stable identifier. Never rendered. */
  id: string
  /** What a buyer is shown. Proper noun, so it is not sentence-cased anywhere. */
  label: string
  kind: PaymentMethodKind
}

export const ACCEPTED_PAYMENT_METHODS: readonly AcceptedPaymentMethod[] = [
  { id: 'visa', label: 'Visa', kind: 'card' },
  { id: 'mastercard', label: 'Mastercard', kind: 'card' },
  { id: 'amex', label: 'Amex', kind: 'card' },
  { id: 'apple-pay', label: 'Apple Pay', kind: 'wallet' },
  { id: 'google-pay', label: 'Google Pay', kind: 'wallet' },
]

/** Just the labels, in declaration order. For a list or a strip of pills. */
export function acceptedPaymentMethodLabels(): string[] {
  return ACCEPTED_PAYMENT_METHODS.map(m => m.label)
}

/**
 * The methods as one sentence, for prose surfaces such as the help centre and
 * the pricing FAQ.
 *
 * Composed rather than written out, so a method added above appears in the
 * sentence without anybody remembering to edit it. The wallet caveat is part of
 * the sentence because it is part of the truth: a wallet is offered only where
 * the buyer's device and browser support it, and a flat claim that every buyer
 * can use Apple Pay is a claim that is false on most desktops.
 */
export function acceptedPaymentMethodsSentence(): string {
  const cards = ACCEPTED_PAYMENT_METHODS.filter(m => m.kind === 'card').map(m => m.label)
  const wallets = ACCEPTED_PAYMENT_METHODS.filter(m => m.kind === 'wallet').map(m => m.label)
  const list = (items: string[]) =>
    items.length <= 1
      ? (items[0] ?? '')
      : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

  if (wallets.length === 0) return `${list(cards)} credit and debit cards.`
  return `${list(cards)} credit and debit cards, plus ${list(wallets)} where your device supports them.`
}
