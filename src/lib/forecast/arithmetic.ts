import { computeFeeLineCents, type FeePassType, type FeeRates } from '@/lib/payments/fee-math'
import { applyFoundingWaiver } from '@/lib/payments/founding-waiver'

/**
 * THE FORECAST ARITHMETIC. PURE, AND ARITHMETIC IS ALL IT IS.
 *
 * Close-out FT1, and the owner's own correction governs the whole design: on
 * day zero the output is plain arithmetic and it says so in plain words. No
 * model is claimed, no confidence interval is invented, nothing is dressed up
 * as a prediction. A tool that lies on day one cannot be trusted on day one
 * hundred.
 *
 * SO THERE IS NO ESTIMATE IN THIS FILE. Every number it returns is a division
 * or a multiplication of something the organiser typed, with the fee taken from
 * the platform's own configuration through the platform's own fee functions.
 * The scenarios below are STATED FRACTIONS OF THEIR OWN ROOM, not predictions
 * of how full it will be, and the page prints them as the assumptions they are.
 *
 * IT REUSES THE CHARGE'S OWN FEE MATH rather than restating it.
 * `computeFeeLineCents` is what the payment calculator calls, so a fee quoted
 * here cannot drift from a fee charged later. That is the fee doctrine's
 * one-source law applied to a marketing page, and it is the reason this file
 * takes `FeeRates` as an argument and never reads a rate itself.
 */

/**
 * THE THREE SCENARIOS, AND WHY THEY ARE FRACTIONS OF THE ROOM RATHER THAN
 * GUESSES AT DEMAND.
 *
 * A quarter, a half and a full room. They are chosen for one reason: an
 * organiser already knows what a quarter of their own room looks like, so the
 * number beside it is immediately checkable against something they can picture.
 * A "likely" or "expected" figure would be a claim about their event that
 * nothing on this platform can yet support, which is exactly what the owner
 * ruled out.
 *
 * They are NOT configuration and must never become it. The moment the slot
 * ledger holds real sell-through for comparable events, these are replaced by a
 * measured line and the method sentence changes with them, together, which is
 * what `method.ts` and its test exist to enforce.
 */
export const SCENARIO_FRACTIONS = [
  { key: 'quarter', numerator: 1, denominator: 4, label: 'a quarter of the room' },
  { key: 'half', numerator: 1, denominator: 2, label: 'half the room' },
  { key: 'full', numerator: 1, denominator: 1, label: 'a full room' },
] as const

export type ScenarioKey = (typeof SCENARIO_FRACTIONS)[number]['key']

export interface ForecastInput {
  /** How many people the room holds. */
  capacity: number
  /** The face value of one ticket, in cents. */
  ticketPriceCents: number
  /** What the organiser says the night costs them, in cents. Zero is allowed. */
  costsCents: number
  /** Days between now and the event. Zero is allowed: the event is today. */
  daysUntilEvent: number
  /** Who carries the fee. The platform's default is pass-on. */
  feePassType: FeePassType
}

export interface ScenarioResult {
  key: ScenarioKey
  label: string
  tickets: number
  /** Face value across those tickets. */
  grossCents: number
  /** The platform fee on them, computed by the charge's own function. */
  feeCents: number
  /** The same fee for an organiser inside the Founding window. */
  foundingFeeCents: number
  /** What the organiser keeps after the fee and after their stated costs. */
  organiserKeepsCents: number
  foundingKeepsCents: number
  /**
   * Tickets a day to get there. Null when the event is today or in the past,
   * because a rate over zero days is a division this refuses to invent.
   */
  ticketsPerDay: number | null
}

export interface BreakEven {
  /** Tickets needed to cover the stated costs. Null when costs are zero. */
  tickets: number | null
  /** False when that number is more than the room holds. */
  withinCapacity: boolean
  /** What one ticket leaves the organiser after the fee, before costs. */
  keepsPerTicketCents: number
  ticketsPerDay: number | null
}

export interface ForecastResult {
  input: ForecastInput
  breakEven: BreakEven
  foundingBreakEven: BreakEven
  scenarios: ScenarioResult[]
  /** True when nothing can be worked out: no capacity or no price. */
  unanswerable: boolean
}

/** Tickets a day, rounded up, or null when there are no days to spread them over. */
function perDay(tickets: number | null, days: number): number | null {
  if (tickets === null || days <= 0) return null
  return Math.ceil(tickets / days)
}

/**
 * What ONE ticket leaves the organiser, after the fee and before their costs.
 *
 * Under PASS-ON the buyer pays the fee on top, so the organiser keeps the face
 * value: that is the whole point of the platform's default and it is why a
 * pass-on break even is simply costs divided by price.
 *
 * Under ABSORB the fee comes out of the payout, so it is computed on ONE ticket
 * through the charge's own function rather than by restating the formula.
 */
function keepsPerTicket(priceCents: number, rates: FeeRates, feePassType: FeePassType): number {
  if (feePassType === 'pass_to_buyer') return priceCents
  const { platform_fee_cents } = computeFeeLineCents(priceCents, 1, rates)
  return priceCents - platform_fee_cents
}

function breakEvenFor(input: ForecastInput, rates: FeeRates): BreakEven {
  const keeps = keepsPerTicket(input.ticketPriceCents, rates, input.feePassType)
  if (input.costsCents <= 0 || keeps <= 0) {
    return {
      tickets: null,
      // A night with no stated costs breaks even on its first ticket, so there
      // is nothing to be outside capacity. A ticket that keeps nothing can
      // never cover a cost, and saying "it cannot" is more use than a number.
      withinCapacity: keeps > 0,
      keepsPerTicketCents: keeps,
      ticketsPerDay: null,
    }
  }
  const tickets = Math.ceil(input.costsCents / keeps)
  return {
    tickets,
    withinCapacity: tickets <= input.capacity,
    keepsPerTicketCents: keeps,
    ticketsPerDay: perDay(tickets, input.daysUntilEvent),
  }
}

/**
 * The whole forecast, from what the organiser typed and the fee the platform is
 * configured to charge.
 *
 * `rates` arrives from `getLivePublicFee` through the page. It is never read
 * here, so this function can be tested at three prices and two capacities
 * without a database, which is what FT1's first acceptance line asks for.
 */
export function forecast(input: ForecastInput, rates: FeeRates): ForecastResult {
  const unanswerable = input.capacity <= 0 || input.ticketPriceCents <= 0
  const foundingRates = applyFoundingWaiver(rates, true)

  if (unanswerable) {
    const empty: BreakEven = { tickets: null, withinCapacity: false, keepsPerTicketCents: 0, ticketsPerDay: null }
    return { input, breakEven: empty, foundingBreakEven: empty, scenarios: [], unanswerable: true }
  }

  const scenarios: ScenarioResult[] = SCENARIO_FRACTIONS.map(fraction => {
    const tickets = Math.floor((input.capacity * fraction.numerator) / fraction.denominator)
    const grossCents = tickets * input.ticketPriceCents
    const feeCents = computeFeeLineCents(grossCents, tickets, rates).platform_fee_cents
    const foundingFeeCents = computeFeeLineCents(grossCents, tickets, foundingRates).platform_fee_cents
    /*
     * WHAT THE ORGANISER KEEPS depends on who carries the fee, and both arms
     * subtract the stated costs, because the question an organiser is actually
     * asking is whether they go home with anything.
     */
    const afterFee = input.feePassType === 'pass_to_buyer' ? grossCents : grossCents - feeCents
    const foundingAfterFee =
      input.feePassType === 'pass_to_buyer' ? grossCents : grossCents - foundingFeeCents
    return {
      key: fraction.key,
      label: fraction.label,
      tickets,
      grossCents,
      feeCents,
      foundingFeeCents,
      organiserKeepsCents: afterFee - input.costsCents,
      foundingKeepsCents: foundingAfterFee - input.costsCents,
      ticketsPerDay: perDay(tickets, input.daysUntilEvent),
    }
  })

  return {
    input,
    breakEven: breakEvenFor(input, rates),
    foundingBreakEven: breakEvenFor(input, foundingRates),
    scenarios,
    unanswerable: false,
  }
}
