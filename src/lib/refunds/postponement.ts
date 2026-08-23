/**
 * THE POSTPONED-EVENT LADDER. One decision, used by the refund path and the
 * payout path, so the two can never disagree about what a postponement means.
 *
 * RESEARCHED, NOT ASSUMED (Law 7). All three fetched 2026-08-23:
 *
 *   Eventbrite's Postponed Event Policy
 *   https://www.eventbrite.com/help/en-us/articles/169121/eventbrites-postponed-event-policy/
 *     "0-90 days after the event was postponed: Organizers are given 90 days to
 *      reschedule their event and can process refunds at their own discretion
 *      during this time. 91-135 days: Organizers are required to honor attendee
 *      refund requests during this 45 day period, even if a new date has been
 *      set. 136 or more days: Organizers are required to process refunds upon
 *      attendee request until the event has been rescheduled."
 *     "Cancelled - The event will not be taking place on the scheduled date and
 *      will not be rescheduled within 90 days."
 *     "When an event is postponed, Eventbrite holds the event payout ... under
 *      no circumstances will payouts be sent until either: 1. The event
 *      successfully completes, or; 2. Rescheduled event details have been
 *      updated on the Eventbrite platform and communicated to attendees."
 *
 *   Ticketmaster Australia Purchase Policy, clause 6.3
 *   https://www.ticketmaster.com.au/h/purchase.html
 *     On a reschedule, tickets stay valid for the new date. A refund is
 *     available only if the buyer notifies "before the specified deadline (which
 *     will be a reasonable period from the time the rescheduled event date is
 *     announced)", and "failure to notify us ... will be deemed to be a
 *     reconfirmation of your order". Also, flatly: "no refunds will be available
 *     until the new date is announced".
 *
 *   ACCC, Buying tickets to events
 *   https://www.accc.gov.au/consumers/buying-products-and-services/buying-tickets-to-events
 *     "Where the event organiser chooses to cancel or makes a major change to an
 *      event, consumers are entitled to a refund under their consumer rights."
 *
 * WHERE WE DELIBERATELY DIVERGE FROM EVENTBRITE, AND WHY IT IS NOT AN OVERSIGHT.
 *
 * Eventbrite's first rung gives the organiser NINETY DAYS of discretion, during
 * which a refund request can simply be refused. That is a United States policy.
 * In Australia the consumer-guarantee entitlement attaches to the major change
 * itself, not to a countdown, and an event postponed with no replacement date is
 * the clearest major change there is. Copying the 90-day discretion window would
 * mean refusing refunds Australian buyers may already be entitled to, with a US
 * help-centre article as the justification. So rung one is ours, not theirs:
 *
 *   the moment an event is postponed with no new date, the buyer can have their
 *   money back, whatever the organiser's refund policy says.
 *
 * Ticketmaster AU's own words are that "no refunds will be available until the
 * new date is announced". Ours is the exact opposite, and it costs us nothing
 * because the funds are still held.
 *
 * WHERE WE FOLLOW TICKETMASTER AU. On a RESCHEDULE their construct is right and
 * is the fair one: the ticket stays valid, and the buyer gets a window from the
 * announcement to say they cannot make the new date. We keep that, but we make
 * "a reasonable period" a PUBLISHED NUMBER rather than a judgement call, because
 * a deadline a buyer cannot compute is not a deadline they can rely on.
 */

import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * How long a buyer has, from the announcement of a new date, to say they cannot
 * make it and take a refund instead.
 *
 * Ticketmaster AU leaves this as "a reasonable period". Fourteen days is that
 * period made checkable: long enough to cover somebody away for a fortnight, and
 * short enough that an organiser knows where they stand before the new date
 * arrives. Silence past it is reconfirmation, exactly as clause 6.3 provides.
 */
export const RESCHEDULE_REFUND_WINDOW_DAYS = 14

/**
 * The point at which a postponement stops being a postponement.
 *
 * This is Eventbrite's own definition of a cancellation, adopted verbatim
 * because it is a sensible line and because matching the market's definition
 * makes the promise legible to an organiser who has used them: "Cancelled - The
 * event will not be taking place on the scheduled date and will not be
 * rescheduled within 90 days."
 */
export const POSTPONEMENT_BECOMES_CANCELLATION_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export type PostponementStage =
  /** Not postponed and never was. Ordinary rules apply. */
  | 'none'
  /** Postponed, no new date announced. Refunds mandatory, payout held. */
  | 'postponed_open'
  /**
   * Postponed for 90 days or more with still no new date. By Eventbrite's own
   * definition this is a cancellation. Refunds stay mandatory, payout stays
   * held, and the platform should be pressing the organiser to cancel properly.
   */
  | 'overdue_cancellation'
  /** A new date is set and the buyer's window to decline it is still open. */
  | 'rescheduled_window_open'
  /** A new date is set and the window closed. Silence was reconfirmation. */
  | 'rescheduled_window_closed'

export interface PostponementInput {
  /** The event's lifecycle status. */
  eventStatus: string
  /** When the postponement was announced. Null if it never was. */
  postponedAt: Date | null
  /** When a new date was set and communicated. Null while still postponed. */
  rescheduledAt: Date | null
  now: Date
}

export interface PostponementVerdict {
  stage: PostponementStage
  /**
   * True when a refund must be granted on request REGARDLESS of the organiser's
   * refund policy. This is the whole point of the ladder.
   */
  refundMandatory: boolean
  /**
   * True when the organiser must not be paid out yet.
   *
   * NOTE ON WHY THIS IS SIMPLER THAN EVENTBRITE'S RELEASE CONDITION. Eventbrite
   * has to explicitly release a held payout on reschedule because their default
   * is to pay out on a schedule. EventLinqs already holds funds until after the
   * event, so a rescheduled event needs no release at all: it simply has a new
   * end date, and the ordinary post-event disbursement runs from that. All this
   * flag has to do is stop a payout going out while the event is in limbo.
   */
  payoutHeld: boolean
  /** The last moment the reschedule-decline window is open, when there is one. */
  declineDeadline: Date | null
  /** The sentence shown to the buyer. Never assembled by callers. */
  message: string
}

/** Whole days elapsed since `from`, floored, never negative. */
function daysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS))
}

/**
 * The decline deadline as a date the buyer can act on, in the PLATFORM zone.
 *
 * THE `timeZone` ARGUMENT IS NOT OPTIONAL AND THIS COMMENT IS WHY. Without it,
 * `toLocaleDateString` formats in the RUNTIME's zone: UTC on the server, the
 * visitor's zone in the browser. The server and the client then render a
 * different date for the same instant, which is a hydration mismatch, and an
 * evening deadline in Sydney prints as the PREVIOUS DAY in UTC. A buyer would
 * be shown a deadline a day earlier than the one the code enforces.
 *
 * tests/unit/dashboard/no-clock-during-render.test.ts caught exactly this in
 * the first version of this file, which is the guard doing its job.
 */
function formatDeadline(deadline: Date): string {
  return deadline.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: PLATFORM_TIME_ZONE,
  })
}

/**
 * The single decision. Pure: no clock, no database, no network. `now` is passed
 * in so the ladder can be tested at every rung rather than only at today's.
 */
export function evaluatePostponement(input: PostponementInput): PostponementVerdict {
  const { eventStatus, postponedAt, rescheduledAt, now } = input

  // A rescheduled event is one that WAS postponed and now has a new date. It is
  // checked first because such an event is back to `published`, so testing the
  // status alone would read it as an ordinary event and silently drop the
  // buyer's window to decline the new date.
  if (rescheduledAt) {
    const deadline = new Date(rescheduledAt.getTime() + RESCHEDULE_REFUND_WINDOW_DAYS * DAY_MS)
    if (now <= deadline) {
      return {
        stage: 'rescheduled_window_open',
        refundMandatory: true,
        payoutHeld: false,
        declineDeadline: deadline,
        message:
          `This event was moved to a new date. Your ticket is valid for it. If you cannot make ` +
          `the new date, you can get a full refund until ${formatDeadline(deadline)}.`,
      }
    }
    return {
      stage: 'rescheduled_window_closed',
      refundMandatory: false,
      payoutHeld: false,
      declineDeadline: deadline,
      message:
        'This event was moved to a new date and the window to decline it has closed, so the ' +
        'organiser’s usual refund policy applies again.',
    }
  }

  if (eventStatus === 'postponed') {
    // The payout is held either way. The distinction matters because at 90 days
    // this has stopped being a postponement by the market's own definition, and
    // the organiser needs to be told so rather than left to drift.
    if (postponedAt && daysSince(postponedAt, now) >= POSTPONEMENT_BECOMES_CANCELLATION_DAYS) {
      return {
        stage: 'overdue_cancellation',
        refundMandatory: true,
        payoutHeld: true,
        declineDeadline: null,
        message:
          'This event has been postponed for more than 90 days with no new date, so it is ' +
          'treated as cancelled. Your ticket is fully refundable.',
      }
    }
    return {
      stage: 'postponed_open',
      refundMandatory: true,
      payoutHeld: true,
      declineDeadline: null,
      message:
        'This event has been postponed and no new date has been announced yet. You can wait ' +
        'for the new date, or take a full refund now: while an event is postponed your ticket ' +
        'is refundable whatever the organiser’s usual policy says.',
    }
  }

  return {
    stage: 'none',
    refundMandatory: false,
    payoutHeld: false,
    declineDeadline: null,
    message: '',
  }
}

/**
 * Event statuses that must never be paid out to the organiser.
 *
 * Exported as data rather than re-derived at the call site because the
 * disbursement query needs it as a list, and a second copy of this list is
 * exactly how the payout path and the refund path drift apart.
 *
 * `cancelled` is here for the same reason `postponed` is, and it was the same
 * bug: findDisbursableEvents() selected on end_date alone, so a cancelled event
 * whose original end date had passed was a disbursement candidate while its
 * refunds were still outstanding.
 */
export const NON_DISBURSABLE_EVENT_STATUSES = ['postponed', 'cancelled'] as const
