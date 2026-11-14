import { eventIsPaid } from '@/lib/payments/sale-status'

/**
 * SHOULD THE PUBLISH BUTTON LOOK BLOCKED?
 *
 * WHY THIS EXISTS, 3 September 2026. The Publish button was disabled only for
 * isSubmitting, an empty title and a missing cover. An organiser with a PAID
 * ticket tier and no connected Stripe account saw a live, gold, clickable
 * Publish button, pressed it, and was refused by the server. The refusal was
 * announced and carried a link, which is good, but the control looked available
 * right up to the press. A button that cannot do the thing it names should say
 * so before it is pressed.
 *
 * THIS IS PRESENTATION, NOT A GUARD. checkPublishGate on the server is still the
 * only thing that decides, on the same rule (isOrganiserSellable). Since
 * 14 November 2026 (sell first) that rule refuses only a person's hold or a
 * country we cannot settle in, so this blocks the button only for those two.
 * This function can only make an existing server decision visible earlier. It
 * must never be able to invent a refusal of its own, which is why:
 *
 *   - `canSellPaid` defaults to true at every call site, so a page that could
 *     not resolve it leaves the button exactly as it was before,
 *   - a FAILED read of the organisation resolves to true rather than false,
 *     because turning a transient read failure into "connect Stripe" is the
 *     exact shape that refused every paid event in production on 18 August 2026,
 *   - edit mode is never blocked, because an already-published paid event must
 *     stay editable even while its organisation is restricted.
 *
 * It lives here, and not in publish-gate beside the server gate, for a build
 * reason worth recording: publish-gate transitively imports `server-only`
 * through the Stripe reconciler, so importing it from the form failed the build
 * with "'server-only' cannot be imported from a Client Component module".
 * `eventIsPaid` comes from sale-status, which the checkout client component
 * already imports and is therefore known client-safe, and it is the SAME
 * predicate the sale gate uses, so the button and the gate cannot disagree about
 * what counts as a paid event.
 */
export function isPaidPublishBlocked(input: {
  /** Whether the organisation can currently sell a paid ticket. */
  canSellPaid: boolean
  /** Editing an existing event never blocks. */
  editMode: boolean
  /** Tier prices as the form holds them: strings, because they bind to inputs. */
  tierPrices: Array<{ price: string | number }>
}): boolean {
  if (input.canSellPaid) return false
  if (input.editMode) return false
  return eventIsPaid(input.tierPrices.map((t) => ({ price: Number(t.price) || 0 })))
}

/**
 * SHOULD THE FORM SHOW THE "CONNECT YOUR BANK" STEP?
 *
 * SELL FIRST, CONNECT BEFORE THE PAYOUT (Lawal's yes of 15:22, 14 November 2026:
 * "Yes, you let organisers publish and sell straight away"). A paid event
 * publishes and sells at once; EventLinqs holds the money and pays it to the
 * organiser's own connected account after the event. So an organiser who has not
 * connected yet is shown the one step left, as a step with its link, and the
 * Publish button stays live. Shown only for a NEW paid event the organisation
 * can sell (a blocked one already carries its own notice) and only when it cannot
 * be paid yet. `canBePaid` defaults to true at the call site, so an unresolved
 * read shows nothing rather than a false step.
 */
export function showsConnectBankStep(input: {
  /** Whether the organisation can sell a paid ticket (isOrganiserSellable). */
  canSellPaid: boolean
  /** Whether the organisation can be paid out yet (isOrganiserPayable). */
  canBePaid: boolean
  editMode: boolean
  tierPrices: Array<{ price: string | number }>
}): boolean {
  if (input.canBePaid) return false
  if (!input.canSellPaid) return false
  if (input.editMode) return false
  return eventIsPaid(input.tierPrices.map((t) => ({ price: Number(t.price) || 0 })))
}
