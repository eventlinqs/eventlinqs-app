/**
 * HOW OLD A CACHED STRIPE VERIFICATION MAY BE BEFORE A PAID EVENT MAY NOT BE
 * PUBLISHED ON IT (MONEY FIX A3 LAYER TWO).
 *
 * WHAT THE FIVE SALE COLUMNS ACTUALLY ARE. stripe_account_id,
 * stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country and
 * payout_status are not facts about the organiser. They are a CACHE of what
 * Stripe last said about the organiser, kept current by the account.updated
 * webhook and by whoever last pressed Refresh. Nothing recorded WHEN they were
 * last read, so a row that said "enabled" six weeks ago and has heard nothing
 * since was indistinguishable from one confirmed a minute ago, and the publish
 * gate believed both equally.
 *
 * THE FAILURE THAT MATTERS IS THE SILENT ONE. A webhook that never arrives
 * changes nothing on screen and raises nothing anywhere. The row keeps saying
 * yes, the event publishes, tickets sell, and the charge precondition reads the
 * same stale row and lets them. The first person to find out is the organiser
 * whose transfer fails after the event.
 *
 * TWENTY-FOUR HOURS, AND IT IS A POLICY CHOICE RATHER THAN A MEASUREMENT, so it
 * is said plainly instead of dressed up as derived. In normal operation the
 * webhook keeps the cache current and this window never bites; it bites exactly
 * when webhook delivery has been failing, which is the case it exists for. A
 * day bounds that blind spot while costing at most one Stripe GET per publish
 * attempt on an account nobody has heard from since yesterday. Shorten it by
 * changing this constant; there is nowhere else it is written.
 *
 * NO IMPORTS, for the same reason connect-currency.ts has none: this is read
 * from the publish gate, which is server-only today, and a leaf can never drag
 * a dependency anywhere tomorrow.
 */

/** A cached Stripe verification older than this may not grant a publish. */
export const CONNECT_VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Whether a cached Stripe verification is recent enough to be acted on.
 *
 * ABSENT IS NOT FRESH, and that is the whole point: null, undefined, an empty
 * string and an unparseable date all mean "nobody recorded a verification", and
 * the one thing that must never happen is for a missing stamp to read as a
 * confirmation. A timestamp in the future is also refused rather than trusted,
 * because a clock ahead of ours is not evidence about Stripe.
 */
export function connectVerificationIsFresh(
  verifiedAt: string | Date | null | undefined,
  now: Date = new Date(),
  maxAgeMs: number = CONNECT_VERIFICATION_MAX_AGE_MS,
): boolean {
  if (verifiedAt === null || verifiedAt === undefined || verifiedAt === '') return false
  const at = verifiedAt instanceof Date ? verifiedAt : new Date(verifiedAt)
  const t = at.getTime()
  if (Number.isNaN(t)) return false
  const age = now.getTime() - t
  if (age < 0) return false
  return age <= maxAgeMs
}
