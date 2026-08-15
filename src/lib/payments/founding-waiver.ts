/**
 * The Founding Organiser fee waiver: ONE definition, applied everywhere a fee
 * is computed.
 *
 * THE TERMS (founder, locked 2026-07-27, recorded in docs/PRICING.md):
 *   - Zero PLATFORM fee for six months from onboarding.
 *   - Plus three months for every organiser they bring on board.
 *   - Capped at the first fifty organisations across Geelong and Melbourne.
 *   - The PROCESSING fee is NEVER waived. It is a real third-party cost.
 *   - Anchor: a 20.00 ticket inside the window is 20.50 all in, and the
 *     organiser still keeps the full 20.00.
 *
 * WHY A DATE WINDOW. The waiver used to be `founding_bonus_months`, a counter
 * that nothing read and nothing expired. A timestamp answers "is this
 * organisation inside the window right now" with one comparison that the
 * charge, the display and the payout can each make identically, and it leaves
 * an audit trail because every extension moves a visible date.
 *
 * WHY THIS MODULE EXISTS RATHER THAN AN `if` AT EACH CALL SITE. There are two
 * places that RESOLVE fee rates (the server charge authority and the public
 * display resolver) and both must apply the waiver identically, or the buyer is
 * shown a total that is not the total charged. That is the exact failure the fee
 * system's one-source law exists to prevent, so the rule lives here once and
 * both call it.
 */
import type { FeeRates } from './fee-math'

/** The founder's cap on how many organisations may hold the waiver at once. */
export const FOUNDING_WAIVER_CAP = 50

/** Months of waiver granted when an organisation is onboarded as founding. */
export const FOUNDING_INITIAL_MONTHS = 6

/** Months added to the window for each confirmed referral. */
export const FOUNDING_REFERRAL_MONTHS = 3

export interface FoundingWaiver {
  /** The expiry timestamp, or null when the organisation has no waiver. */
  feeFreeUntil: string | null
  /** True when the window is open at the moment of the check. */
  active: boolean
}

/**
 * Is the window open at `now`? A null expiry is no waiver. The comparison is
 * strictly greater-than, so the waiver ends at the instant of expiry rather
 * than granting a free final millisecond.
 */
export function isWaiverActive(feeFreeUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!feeFreeUntil) return false
  const until = new Date(feeFreeUntil)
  if (Number.isNaN(until.getTime())) return false
  return until.getTime() > now.getTime()
}

/**
 * Applies the waiver to a resolved rate set.
 *
 * The fee goes to zero, both the percentage and the per-ticket flat component.
 *
 * UNDER ONE FEE A WAIVED TICKET IS GENUINELY FREE OF CHARGE. This used to say
 * that a waived 20.00 ticket was 20.50 all in and not 20.00, because the
 * separate processing fee was never waived. That fee no longer exists: the
 * founder ruling of 15 August 2026 deleted it and Stripe's cost now comes out of
 * the single 3.5 per cent. So a waived 20.00 ticket is 20.00 all in, and
 * "completely fee-free" in the founding-offer copy is now literally true where
 * before it was 50 cents short.
 *
 * Pure, so the same function is safe on the server and in a test, and so the
 * waiver can never be half-applied.
 */
export function applyFoundingWaiver(rates: FeeRates, active: boolean): FeeRates {
  if (!active) return rates
  return {
    ...rates,
    platformFeePercent: 0,
    platformFeeFixedCents: 0,
  }
}

/**
 * Extends a window by the referral grant, FROM ITS CURRENT VALUE rather than
 * from today, so referrals stack instead of overwriting each other.
 *
 * A window that has already lapsed (or was never granted) extends from `now`,
 * because granting three months that already expired would be a silent no-op
 * and the organiser would have earned nothing.
 */
export function extendWaiver(
  currentUntil: string | null | undefined,
  months: number = FOUNDING_REFERRAL_MONTHS,
  now: Date = new Date(),
): string {
  const base =
    currentUntil && new Date(currentUntil).getTime() > now.getTime()
      ? new Date(currentUntil)
      : new Date(now)
  return addMonthsUtc(base, months)
}

/**
 * The initial window granted at onboarding: six months from `from`.
 */
export function initialWaiverUntil(from: Date = new Date()): string {
  return addMonthsUtc(from, FOUNDING_INITIAL_MONTHS)
}

/**
 * Adds whole months in UTC.
 *
 * MUST be UTC. `setMonth` operates in the host's LOCAL time while the value is
 * stored and compared as UTC, so on a machine in Australian time a six-month
 * window granted in July (AEST, UTC+10) and expiring in January (AEDT, UTC+11)
 * came out a DAY SHORT: the local clock kept 27 January but the UTC instant
 * moved back to 26 January at 23:00. A fee waiver that quietly loses a day
 * across the daylight-saving boundary is a real defect, not a rounding detail,
 * so the arithmetic is done on the UTC fields only and the result is identical
 * wherever it runs: a server, a laptop, or CI.
 *
 * Month-end overflow keeps JavaScript's native roll-forward (31 August plus six
 * months lands in early March rather than clamping to the end of February).
 * That direction favours the organiser by a day or two and is predictable, so
 * it is kept rather than special-cased.
 */
function addMonthsUtc(from: Date, months: number): string {
  const next = new Date(from.getTime())
  next.setUTCMonth(next.getUTCMonth() + months)
  return next.toISOString()
}

/**
 * Minimal structural type for the Supabase client this module reads through,
 * so both the service-role client (charge) and the anon client (display) fit.
 */
export interface OrganisationReadClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { founding_fee_free_until: string | null } | null; error: unknown }>
      }
    }
  }
}

/**
 * Reads one organisation's waiver state.
 *
 * Returns an INACTIVE waiver on any failure rather than throwing. That
 * direction is deliberate: a lookup failure must never accidentally hand out a
 * free platform fee. It degrades to charging the standard rate, which is the
 * safe side of the error for the business and is visible in reporting, whereas
 * silently waiving fees would not be.
 */
export async function getFoundingWaiver(
  client: OrganisationReadClient,
  organisationId: string | null | undefined,
  now: Date = new Date(),
): Promise<FoundingWaiver> {
  if (!organisationId) return { feeFreeUntil: null, active: false }
  try {
    const { data, error } = await client
      .from('organisations')
      .select('founding_fee_free_until')
      .eq('id', organisationId)
      .maybeSingle()
    if (error || !data) return { feeFreeUntil: null, active: false }
    const feeFreeUntil = data.founding_fee_free_until ?? null
    return { feeFreeUntil, active: isWaiverActive(feeFreeUntil, now) }
  } catch {
    return { feeFreeUntil: null, active: false }
  }
}
