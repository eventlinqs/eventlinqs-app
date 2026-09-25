import { formatMoneyDisplay } from '@/lib/money/format'
import type { BreakEven, ForecastResult, ScenarioResult } from './arithmetic'

/**
 * TURNING THE ARITHMETIC INTO WORDS, IN ONE PLACE.
 *
 * The page renders what this returns and composes nothing of its own, for the
 * same two reasons the proof page does it (close-out GA5): a screen that writes
 * its own wording starts saying something slightly different from the record it
 * describes, and a screen with no strings in it cannot hide a typed number. The
 * registered guard scans the rendering path for a fee, a price or a taxonomy
 * value, and it would have nowhere to look if the page formatted its own money.
 *
 * MONEY IS WRITTEN THE AUSTRALIAN WAY by `formatMoneyDisplay`, en-AU, grouped,
 * always to the cent.
 */

export interface PresentedBreakEven {
  /** The headline: the number of tickets, or the sentence when there is none. */
  headline: string
  /** What one ticket leaves the organiser, written as money. */
  keepsPerTicket: string
  /** The per-day line, or null when the event is today. */
  perDay: string | null
  /** True when the number is more than the room holds. */
  beyondTheRoom: boolean
  beyondTheRoomSentence: string | null
}

export function presentBreakEven(
  breakEven: BreakEven,
  capacity: number,
  currency: string,
): PresentedBreakEven {
  const keepsPerTicket = formatMoneyDisplay(breakEven.keepsPerTicketCents, currency)
  if (breakEven.tickets === null) {
    return {
      headline: breakEven.keepsPerTicketCents > 0
        ? 'You told us this night costs you nothing, so it is in front from the first ticket.'
        : 'At this price a ticket leaves you nothing, so no number of them covers a cost.',
      keepsPerTicket,
      perDay: null,
      beyondTheRoom: false,
      beyondTheRoomSentence: null,
    }
  }
  return {
    headline: `${breakEven.tickets} ${breakEven.tickets === 1 ? 'ticket' : 'tickets'}`,
    keepsPerTicket,
    perDay:
      breakEven.ticketsPerDay === null
        ? null
        : `${breakEven.ticketsPerDay} a day between now and the door`,
    beyondTheRoom: !breakEven.withinCapacity,
    beyondTheRoomSentence: breakEven.withinCapacity
      ? null
      : `That is more than the ${capacity} this room holds. At this price the night cannot cover its costs, whatever happens at the door.`,
  }
}

export interface PresentedScenario {
  key: string
  label: string
  tickets: string
  gross: string
  fee: string
  foundingFee: string
  keeps: string
  foundingKeeps: string
  perDay: string | null
}

export function presentScenarios(result: ForecastResult, currency: string): PresentedScenario[] {
  return result.scenarios.map((s: ScenarioResult) => ({
    key: s.key,
    label: s.label,
    tickets: `${s.tickets}`,
    gross: formatMoneyDisplay(s.grossCents, currency),
    fee: formatMoneyDisplay(s.feeCents, currency),
    foundingFee: formatMoneyDisplay(s.foundingFeeCents, currency),
    keeps: formatMoneyDisplay(s.organiserKeepsCents, currency),
    foundingKeeps: formatMoneyDisplay(s.foundingKeepsCents, currency),
    perDay: s.ticketsPerDay === null ? null : `${s.ticketsPerDay} a day`,
  }))
}

/**
 * THE FEE SENTENCE, BUILT FROM THE RATE RATHER THAN CARRYING ONE.
 *
 * The rate arrives as a number from the configuration and is turned into words
 * here. Nothing in the rendering path may write a rate, which is what makes the
 * guard's scan mean something.
 */
export function feeSentence(percent: number, fixedCents: number, currency: string): string {
  const fixed = formatMoneyDisplay(fixedCents, currency)
  return `EventLinqs charges ${percent} per cent plus ${fixed} a ticket, which is the rate on this platform today and is where every fee figure above comes from.`
}

/**
 * THE FOUNDING SENTENCE. It does not state a rate either: the waiver takes the
 * whole charge to zero, so the sentence says what the figures beside it already
 * show rather than restating a number.
 */
export const FOUNDING_SENTENCE =
  'The second figure is what you pay in your first six months. Every organiser is fee-free for six months from the day they register, with no cap on places, and the standard fee applies after that.'

/** The consent wording an address is taken under, and stored beside it. */
export const EMAIL_CONSENT_TEXT =
  'Send me this result by email. EventLinqs may reply about it once. It does not sign me up to anything and I can say no to anything that follows.'

/**
 * A CENTS VALUE AS THE FORM WANTS IT, which is dollars.
 *
 * It lives here and not in the page for the same reason every other string
 * does: the page must hold no arithmetic at all, or the guard's scan of the
 * rendering path has an exception to argue about. The divisor is the definition
 * of a cent, not a rate, and this is the one place it appears.
 */
export function centsAsFormDollars(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return ''
  return (cents / 100).toFixed(2)
}

/** A count as the form wants it. Empty rather than a zero nobody typed. */
export function countAsFormValue(value: number): string {
  return Number.isFinite(value) && value > 0 ? String(value) : ''
}
