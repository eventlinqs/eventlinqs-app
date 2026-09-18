/**
 * WHEN AN ORGANISER HEARS ABOUT A SALE. Close-out MONEY FIX, part B, step B4.
 *
 * "The organiser receives: first sale on each event; sales thereafter
 * immediately or as a daily digest by their own preference defaulting to
 * daily."
 *
 * Pure, like platform-policy.ts and for the same reason: the decision about
 * whether a person is told their event sold a ticket is worth testing
 * exhaustively, and a decision that needs a database and a clock to reach gets
 * tested once on the happy path and never again.
 *
 * WHAT THIS FILE DOES NOT DECIDE. Whether the organiser can be reached, what
 * the message says, and whether it was delivered. Those are the sender's,
 * src/lib/notifications/organiser-sale-notify.ts.
 */

/**
 * The organiser's own setting, `organisations.sales_notification_mode`.
 *
 * Defaulting to 'daily' is the item's wording, and it matters which way the
 * default falls: an organiser who has never opened a settings page still hears
 * about their money.
 */
export const SALES_NOTIFICATION_MODES = ['immediate', 'daily', 'off'] as const
export type SalesNotificationMode = (typeof SALES_NOTIFICATION_MODES)[number]

export const DEFAULT_SALES_NOTIFICATION_MODE: SalesNotificationMode = 'daily'

/**
 * READ THE STORED VALUE FAIL-SAFE, which here means fail-LOUD-to-the-organiser
 * rather than fail-silent.
 *
 * A null (a row written before the column existed), an empty string, or a value
 * the CHECK constraint should have refused all resolve to the default. The
 * alternative, treating an unrecognised value as 'off', would mean a bad write
 * silently stops an organiser being told about their own sales, which is the
 * exact failure this whole item exists to end. Being told when you asked not to
 * be is a nuisance; not being told when you asked to be is the defect.
 */
export function readSalesNotificationMode(stored: string | null | undefined): SalesNotificationMode {
  if (stored === 'immediate' || stored === 'daily' || stored === 'off') return stored
  return DEFAULT_SALES_NOTIFICATION_MODE
}

/**
 * What to do about one confirmed, paid order, right now.
 *
 *   'send_first_sale'  the first paid ticket on this event: send immediately
 *   'send_sale'        a later sale and they asked for each one
 *   'hold_for_digest'  a later sale and they take the daily roll-up
 *   'send_nothing'     they switched sale messages off
 */
export type OrganiserSaleDecision =
  | 'send_first_sale'
  | 'send_sale'
  | 'hold_for_digest'
  | 'send_nothing'

export interface OrganiserSaleInputs {
  mode: SalesNotificationMode
  /** True when this order is the first confirmed, paid order on this event. */
  isFirstSaleForEvent: boolean
}

/**
 * THE DECISION.
 *
 * 'off' SILENCES THE FIRST SALE TOO, and that is a deliberate reading rather
 * than an oversight. The item's reversal condition says an organiser "may
 * reduce their own sales notifications to a daily digest or switch them off",
 * and the first sale is a sales notification. Carving it out would mean the
 * platform decided it knew better than the organiser about a message the
 * organiser had explicitly refused, on the one subject the item insists belongs
 * to them. The messages they cannot switch off are the ones the same sentence
 * names: payout, refund, dispute and payment setup. None of those pass through
 * here, and the guard fails the build if one starts to.
 */
export function decideOrganiserSaleMessage(inputs: OrganiserSaleInputs): OrganiserSaleDecision {
  if (inputs.mode === 'off') return 'send_nothing'
  if (inputs.isFirstSaleForEvent) return 'send_first_sale'
  if (inputs.mode === 'immediate') return 'send_sale'
  return 'hold_for_digest'
}

/**
 * The declared message type each decision sends, so the sender never writes a
 * type literal and the matrix is the only place the names live.
 */
export function messageTypeForDecision(decision: OrganiserSaleDecision): string | null {
  switch (decision) {
    case 'send_first_sale':
      return 'organiser_first_sale'
    case 'send_sale':
      return 'organiser_sale'
    case 'hold_for_digest':
    case 'send_nothing':
      return null
  }
}
