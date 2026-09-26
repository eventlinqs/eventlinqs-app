/**
 * The Founding Organiser fee waiver: ONE definition, applied everywhere a fee
 * is computed.
 *
 * THE TERMS are LAW 24 as ruled on 26 September 2026, written out in full
 * beside FOUNDING_BADGE_NAME below. The first ruling (20 September 2026) read:
 * "Every new organiser gets six months free, counted from the date they
 * register or set up on EventLinqs. Not a cap of 50. Every organiser. After
 * six months the standard fee applies."
 *   - Zero fee for six months from the organisation's OWN registration. There
 *     is one fee, so the waiver takes the whole charge to zero.
 *   - Plus three months for every organiser they bring on board who sells a
 *     paid ticket (unchanged; LAW 24 does not mention it).
 *   - No cap. Until 26 September 2026 this said "capped at the first fifty
 *     organisations nationally", and the code, two SQL functions and every
 *     surface enforced it. Migration 20260926000001 removed the cap and made
 *     the database stamp every organisation's window at registration.
 *
 * ONE-FEE-ALLOW-BEGIN: quotes the wrong text it replaced, so the correction is
 * legible rather than a silent edit.
 * These two lines used to sit here and were WRONG from 15 August 2026: "The
 * PROCESSING fee is NEVER waived. It is a real third-party cost." and "Anchor: a
 * 20.00 ticket inside the window is 20.50 all in." Both described the deleted
 * second fee, and both contradicted the docblock on applyFoundingWaiver twelve
 * lines below, which had been corrected. A file arguing with itself is how the
 * next reader picks the wrong half. The worked anchors are computed from the lock
 * block in docs/PRICING.md and are not restated here.
 * ONE-FEE-ALLOW-END
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
import { captureException } from '@/lib/observability/sentry'

/**
 * Months fee-free from an organisation's OWN registration (LAW 24). The
 * database stamps the window at insert (trigger trg_registration_fee_free_window,
 * migration 20260926000001) with founding_add_months(created_at, 6), the SQL
 * twin of addMonthsUtc below.
 */
export const FOUNDING_INITIAL_MONTHS = 6

/** Months added to the window for each confirmed referral. */
export const FOUNDING_REFERRAL_MONTHS = 3

/*
 * THE OFFER, IN ONE PLACE (LAW 24 as ruled, 26 September 2026, founder ruling).
 *
 *   1. Every organiser gets six months with no platform fee, counted from the
 *      date they register on EventLinqs. No cap, no limit on places, no
 *      invitation needed.
 *   2. It applies to every organiser, including those who registered before
 *      20 September 2026, each from their own registration date.
 *   3. Referral months stay exactly as built: three fee free months for each
 *      organiser they refer who sells a ticket, on top of the six months.
 *   4. When the free months end, the standard fee applies.
 *   5. "Founding Organiser" stays as the name and badge, and every organiser
 *      receives it.
 *   6. EventLinqs is national.
 *
 * The two numbers above, the badge name and the scope below are the whole of
 * the offer. Every surface that states it renders these values (pages, the
 * organiser agreement, emails, SMS, admin, dashboard, the forecast, metadata);
 * a static document that cannot render them is held to them by
 * scripts/guards/offer-is-one-rule.mjs. A change is made HERE and nowhere else.
 */

/** Point 5: the name and the badge, held by every organiser. */
export const FOUNDING_BADGE_NAME = 'Founding Organiser'

/** Point 6: where the offer and the platform apply. The whole country. */
export const FOUNDING_OFFER_SCOPE = 'Australia'

const MONTH_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** A month count as a word ("six"), so prose says the module's number rather than a typed one. */
export function monthsInWords(months: number): string {
  return MONTH_WORDS[months] ?? String(months)
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** "six", from FOUNDING_INITIAL_MONTHS. */
export const FOUNDING_INITIAL_MONTHS_WORD = monthsInWords(FOUNDING_INITIAL_MONTHS)

/** "three", from FOUNDING_REFERRAL_MONTHS. */
export const FOUNDING_REFERRAL_MONTHS_WORD = monthsInWords(FOUNDING_REFERRAL_MONTHS)

/**
 * The ruling, said one way. A surface that states the offer in a sentence
 * renders one of these rather than writing its own, so there is no second
 * wording to drift.
 */
export const FOUNDING_TERMS = {
  /** Points 1 and 2. */
  initial: `Every organiser gets ${FOUNDING_INITIAL_MONTHS_WORD} months with no platform fee, counted from the date they register on EventLinqs. No cap, no limit on places, no invitation needed.`,
  /** Point 3. */
  referral: `${capitalised(FOUNDING_REFERRAL_MONTHS_WORD)} more fee-free months for each organiser you refer who sells a ticket, on top of the ${FOUNDING_INITIAL_MONTHS_WORD} months.`,
  /** Point 4. */
  after: 'When the free months end, the standard fee applies.',
  /** Point 5. */
  badge: `Every organiser is a ${FOUNDING_BADGE_NAME}.`,
  /** Point 6. */
  scope: `EventLinqs is national: the offer is open to every organiser in ${FOUNDING_OFFER_SCOPE}.`,
} as const

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
 * ONE-FEE-ALLOW-BEGIN: records the superseded anchor so the change is auditable.
 * UNDER ONE FEE A WAIVED TICKET IS GENUINELY FREE OF CHARGE. This used to say
 * that a waived 20.00 ticket was 20.50 all in and not 20.00, because the
 * separate processing fee was never waived. That fee no longer exists: the
 * founder ruling of 15 August 2026 deleted it and Stripe's cost now comes out of
 * the single 3.5 per cent. So a waived 20.00 ticket is 20.00 all in, and
 * "completely fee-free" in the founding-offer copy is now literally true where
 * before it was 50 cents short.
 * ONE-FEE-ALLOW-END
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
 * The six-month window from `from`. Under LAW 24 `from` is the organisation's
 * registration (organisations.created_at), which is what
 * registrationWaiverUntil says out loud.
 */
export function initialWaiverUntil(from: Date = new Date()): string {
  return addMonthsUtc(from, FOUNDING_INITIAL_MONTHS)
}

/**
 * LAW 24: the window every organisation holds, six months from its own
 * registration. The database trigger computes the same instant with
 * founding_add_months(created_at, 6); tests/unit/payments/law24-every-organiser.test.ts
 * pins the two to the same rule.
 */
export function registrationWaiverUntil(registeredAt: string | Date): string {
  return initialWaiverUntil(new Date(registeredAt))
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
  } catch (error) {
    captureException(error, { where: 'lib/payments/founding-waiver:185' })
    return { feeFreeUntil: null, active: false }
  }
}
