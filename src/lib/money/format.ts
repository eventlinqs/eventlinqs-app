/**
 * Canonical money formatter.
 *
 * Single source of truth for turning an integer minor-unit amount (cents,
 * kobo, etc.) into a display string. All monetary values in this codebase
 * are stored as integers in the smallest currency unit, so the only safe
 * input is an integer count of minor units taken straight from the
 * database column that holds it (for the confirmation email that is
 * `orders.total_cents`, the authoritative "what the buyer pays" value).
 *
 * Output format intentionally matches the string already shown to buyers
 * at checkout and on the organiser revenue summary (`CCY 0.00`), so the
 * amount a buyer sees in their confirmation email is identical to the
 * amount they saw when they paid.
 *
 * `Math.round` is applied defensively: if a non-integer ever reaches this
 * function (the class of defect tracked as pre-launch hardening item 9,
 * the Stripe revenue card rounding display bug) it is pinned to the
 * nearest minor unit here rather than rendering a fractional cent. This
 * formatter does not fix item 9 - that fix is a separate PR and should
 * adopt this function as its formatter at that time.
 *
 * @param cents Integer amount in the smallest currency unit.
 * @param currency ISO 4217 code (case-insensitive).
 * @returns e.g. `"AUD 35.00"`.
 */
export function formatMoney(cents: number, currency: string): string {
  const minorUnits = Math.round(Number.isFinite(cents) ? cents : 0)
  return `${currency.toUpperCase()} ${(minorUnits / 100).toFixed(2)}`
}
