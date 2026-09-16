/**
 * WHAT A BUYER IS TOLD WHEN THE CHECKOUT SUBMIT NEVER REACHED US.
 *
 * ============================================================================
 * THE DEFECT THIS CLOSES, DRIVEN RATHER THAN REASONED (close-out C8B.5,
 * 15 September 2026)
 * ============================================================================
 *
 * Scope v5 section 10.3: "Checkout must not fail under poor network
 * conditions." Close-out pulls that line forward out of the Africa deferral in
 * its own words: "Australians on a phone at a venue with bad reception are the
 * same problem as anyone else on a weak network."
 *
 * `scripts/verify/scope-10-3-audit.mjs` drove it at 390, 768 and 1440 with the
 * network cut at the moment of submit, and at all three widths the buyer was:
 *
 *   - thrown to the checkout error boundary ("We hit a snag with your
 *     checkout"),
 *   - stripped of every value they had typed, their name, their email and every
 *     attendee's details, because the boundary replaces the route segment and
 *     the form's state goes with it,
 *   - and told "Our team has been notified", which on a dropped connection is
 *     not true: the error report cannot leave the browser either.
 *
 * The cause is one missing `catch`. `processCheckout` is a Server Action, so
 * calling it is a `fetch`, and a `fetch` on a dead radio REJECTS. The rejection
 * was raised inside `startTransition(async () => ...)` with nothing to catch it,
 * so React did the only thing it can with an unhandled rejection and surfaced it
 * to the nearest boundary.
 *
 * ============================================================================
 * WHY THIS IS A MODULE AND NOT THREE LINES IN THE COMPONENT
 * ============================================================================
 *
 * Two reasons, and the second is the one that matters. It lets the unit tests
 * execute the decision instead of asserting on a rendered string. And it lets
 * `scripts/guards/checkout-survives-a-dropped-network.mjs` require that the
 * submit path CALLS this, rather than grepping the component for the word
 * "catch", which any future refactor would defeat while looking tidy.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT DO
 * ============================================================================
 *
 * It invents no retry mechanism. A thrown network failure is put on exactly the
 * same footing as an error the action RETURNS (a refused reservation, a rate
 * limit): the message lands in the same `submitError` panel, the form keeps its
 * values, and re-submitting is the buyer pressing the same button again, which
 * is what already happens today for every returned refusal. Inventing a
 * re-submit here would mean reasoning about whether a half-sent action created
 * an order, and that is the checkout action's question, not this one's.
 */

/** Which of the two network stories happened, so a test can assert on the case rather than the prose. */
export type CheckoutSubmitFailureKind = 'offline' | 'unreachable'

export interface CheckoutSubmitFailure {
  kind: CheckoutSubmitFailureKind
  message: string
}

/**
 * The copy, in one place.
 *
 * Both sentences are true at the moment they are shown, and neither claims
 * something this code cannot know. "Your details are still here" is a statement
 * about the page the buyer is looking at, which is the whole change. The held
 * tickets keep their own timer, which is already on screen, so the wording
 * points at it rather than restating a deadline that could be wrong.
 *
 * House rules: Australian English, no em-dashes or en-dashes, no exclamation
 * marks, nothing a reader could mistake for a payment failure. A buyer told
 * "payment failed" on a dropped connection rings their bank; a buyer told they
 * are offline checks their signal.
 */
const COPY: Record<CheckoutSubmitFailureKind, string> = {
  offline:
    'You are offline, so your details were not sent. Nothing has been charged and nothing is lost: everything you typed is still on this page, and your tickets keep their hold. Reconnect, then press the button again.',
  unreachable:
    'We could not reach EventLinqs, so your details were not sent. Nothing has been charged and nothing is lost: everything you typed is still on this page, and your tickets keep their hold. Check your connection, then press the button again.',
}

/**
 * Describe a THROWN checkout submit failure.
 *
 * @param online what `navigator.onLine` said at the moment of the failure. It
 *   is passed in rather than read here so this stays pure and so a test can
 *   drive both branches without a browser. Note what the flag is worth: `false`
 *   is reliable (the machine knows it has no route), `true` only means an
 *   interface is up, which is why the other branch says "could not reach"
 *   rather than blaming the buyer's connection outright.
 */
export function describeCheckoutSubmitFailure(online: boolean): CheckoutSubmitFailure {
  const kind: CheckoutSubmitFailureKind = online ? 'unreachable' : 'offline'
  return { kind, message: COPY[kind] }
}

/**
 * Read `navigator.onLine` without assuming a browser.
 *
 * The component renders on the server first, and a `navigator` reference that
 * throws during a server render would replace one crash with another.
 */
export function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}
