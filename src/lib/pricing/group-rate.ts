/**
 * THE GROUP RATE AND ITS FLOOR: THE HALF THAT IS NOT SQL.
 *
 * Close-out AQ2. "Group purchase of three or more at a rate the organiser sets
 * once, above the price floor."
 *
 * WHY THIS EXISTS BESIDE A TRIGGER THAT ALREADY REFUSES. The database is the
 * enforcement and always will be: a backfill, a hand-run INSERT and a future
 * admin screen all meet it. But a person setting a rate needs to be TOLD the
 * floor before they type a number under it, and a form that can only discover
 * the floor by being refused is a form that teaches nothing. So the arithmetic
 * is here too, and a test compares the two across a matrix of fees rather than
 * assuming they agree, which is the same posture the price bands and the
 * community map already take.
 *
 * PURE, AND THE FEE IS AN ARGUMENT. Nothing here reads pricing_rules: the
 * caller resolves the fee through the ONE resolver (getPricingRule) and hands
 * the two numbers in. That is what keeps this from becoming a second source of
 * the fee, which the constitution forbids in the plainest terms it uses
 * anywhere.
 *
 * THE DERIVATION, spelled out because the number it produces refuses a price.
 * The platform fee on one ticket at P cents is
 *
 *     fee(P) = round(P * pct / 100 + fixed)
 *
 * which is computeFeeLineCents at ticketCount = 1. A ticket that does not clear
 * its own fee leaves the organiser nothing at all, so the floor is the smallest
 * whole cent at which it does:
 *
 *     P - P * pct / 100 - fixed > 0   <=>   P > fixed / (1 - pct / 100)
 *
 * That solves it over the reals. The fee is charged in WHOLE CENTS, so the
 * floor is the smallest whole price at which the ROUNDED fee still leaves
 * something, which is the real inequality and is sometimes a cent higher. The
 * function below asks the rounded question rather than trusting the algebra.
 */

/** AQ2 says three or more, and the database refuses two. */
export const MINIMUM_GROUP_SIZE = 3

export interface GroupRateFeeInputs {
  /** The resolved platform fee percentage, 0 to under 100. */
  platformFeePercent: number
  /** The resolved platform fee fixed component, in cents. */
  platformFeeFixedCents: number
}

/**
 * The lowest group rate this event may carry, in cents.
 *
 * Throws on a fee of 100 per cent or more, because there is no price that
 * clears it and returning a number would be inventing one. That is a
 * misconfiguration of pricing_rules rather than a pricing question, and the
 * trigger raises on it too.
 */
export function groupRateFloorCents(fees: GroupRateFeeInputs): number {
  const pct = fees.platformFeePercent
  const fixed = fees.platformFeeFixedCents
  if (!Number.isFinite(pct) || !Number.isFinite(fixed)) {
    throw new Error('the platform fee did not resolve to numbers, so no floor can be derived')
  }
  if (pct >= 100) {
    throw new Error(
      `the platform fee resolves to ${pct}%, so no ticket price clears it. Fix pricing_rules before setting a group rate.`,
    )
  }
  /*
   * THE ANALYTIC ANSWER IS A CENT SHORT, AND THE BOUNDARY TEST IS WHAT SAID SO.
   *
   * fixed / (1 - pct/100) solves the inequality over the REALS, but the fee the
   * platform actually charges is ROUNDED to whole cents:
   *
   *     at 3.5% + 99c   price 103   fee round(102.605) = 103   payout 0
   *                     price 104   fee round(102.640) = 103   payout 1
   *
   * So the real floor is 104 and the formula answered 103, a price at which the
   * organiser nets exactly nothing. The analytic value is kept as the starting
   * point, because it is never more than a cent or two out, and then the actual
   * rounded fee is asked the actual question. The loop is bounded and in
   * practice runs once.
   */
  const feeAt = (price: number) => Math.round((price * pct) / 100 + fixed)
  let candidate = Math.max(1, Math.floor(fixed / (1 - pct / 100)))
  for (let step = 0; step < 1000; step += 1) {
    if (candidate - feeAt(candidate) > 0) return candidate
    candidate += 1
  }
  throw new Error(
    `no price within a thousand cents of ${Math.floor(fixed / (1 - pct / 100))} clears a fee of ${pct}% plus ${fixed}c`,
  )
}

export type GroupRateRefusal =
  | 'below-the-floor'
  | 'not-below-the-ticket-price'
  | 'free-tier'
  | 'group-too-small'

export interface GroupRateVerdict {
  ok: boolean
  refusal: GroupRateRefusal | null
  floorCents: number
  /** Plain words, the same ones the database raises, so a form and a refusal agree. */
  reason: string
}

/**
 * Judge a proposed group rate the way the database will judge it.
 *
 * The ORDER of the checks matters and matches the trigger: a rate on a free
 * tier is refused before its number is considered at all, because "your group
 * rate is below the floor" is a confusing thing to tell somebody whose ticket
 * is free.
 */
export function judgeGroupRate(params: {
  unitPriceCents: number
  minGroupSize: number
  tierPriceCents: number
  fees: GroupRateFeeInputs
}): GroupRateVerdict {
  const floorCents = groupRateFloorCents(params.fees)

  if (params.minGroupSize < MINIMUM_GROUP_SIZE) {
    return {
      ok: false,
      refusal: 'group-too-small',
      floorCents,
      reason: `a group is ${MINIMUM_GROUP_SIZE} or more. A group of ${params.minGroupSize} is people buying tickets.`,
    }
  }
  if (params.tierPriceCents <= 0) {
    return {
      ok: false,
      refusal: 'free-tier',
      floorCents,
      reason: 'a group rate needs a paid ticket, and this one is free.',
    }
  }
  if (params.unitPriceCents >= params.tierPriceCents) {
    return {
      ok: false,
      refusal: 'not-below-the-ticket-price',
      floorCents,
      reason:
        'a group rate that saves nothing is a price rise waiting to be explained. It has to be below the ticket price.',
    }
  }
  if (params.unitPriceCents < floorCents) {
    return {
      ok: false,
      refusal: 'below-the-floor',
      floorCents,
      reason:
        'below this the ticket does not clear the EventLinqs fee on itself, so the organiser is paying to sell it.',
    }
  }
  return { ok: true, refusal: null, floorCents, reason: 'this rate clears the fee and saves the group money.' }
}

/**
 * THE CURRENCY TO COUNTRY MAP, the third copy of a decision that already exists
 * twice, and it is here so the third copy can be DELETED rather than tolerated.
 *
 * src/lib/payments/payment-calculator.ts derives the pricing country from the
 * currency and keeps its map private. The AQ2 trigger needs the same mapping in
 * SQL, so it has one. This export exists purely so a test can hold all of them
 * together; nothing in the application reads it in preference to the
 * calculator's own.
 */
export const PRICING_COUNTRY_BY_CURRENCY: Readonly<Record<string, string>> = {
  AUD: 'AU',
  USD: 'US',
  GBP: 'GB',
  EUR: 'IE',
  CAD: 'CA',
  NZD: 'NZ',
  NGN: 'NG',
  GHS: 'GH',
  KES: 'KE',
  ZAR: 'ZA',
}

export function pricingCountryForCurrency(currency: string): string {
  return PRICING_COUNTRY_BY_CURRENCY[currency.toUpperCase()] ?? 'GLOBAL'
}
