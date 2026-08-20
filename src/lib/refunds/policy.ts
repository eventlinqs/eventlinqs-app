import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * THE ONE REFUND-POLICY DECISION.
 *
 * Every surface that answers "can this be refunded" consults this module and
 * nothing else: the event page before purchase, the confirmation email, the
 * buyer's ticket page, the request server action, the auto-approval, and the
 * organiser's queue. One function, so the sentence a buyer reads before paying
 * is produced by the same code that decides afterwards.
 *
 * That is not a style preference. The refusal a buyer sees IS the product here:
 * this project has already spent an evening on a "Not on sale yet" message that
 * described a sales window the codebase did not have. So every refusal below
 * carries a machine-readable `reason` AND the plain sentence shown to the buyer,
 * produced together, from the same branch, and never assembled separately by a
 * caller.
 *
 * PURE. No database, no clock of its own, no environment. `now` is passed in, so
 * a test can put itself either side of a deadline without mocking time.
 */

export type RefundPolicyType = 'days_before' | 'no_refunds'

export interface RefundPolicy {
  type: RefundPolicyType
  /** Days before start_date that the request window closes. SMALLER IS LOOSER. */
  days: number
  /** The organiser absorbs the EventLinqs fee, so the buyer gets face value back. */
  absorbFee: boolean
  /** A qualifying request is actioned without the organiser (the Humanitix model). */
  selfService: boolean
}

export type EventStatusForRefund =
  | 'draft' | 'scheduled' | 'published' | 'paused' | 'postponed' | 'cancelled' | 'completed'

export interface RefundEligibilityInput {
  policy: RefundPolicy
  eventStatus: EventStatusForRefund
  eventStartDate: Date
  /** What the buyer actually paid. A free order has nothing to refund. */
  orderTotalCents: number
  /** Terminal orders cannot be asked about again. */
  orderStatus: string
  /** Tickets on the order that are still live and therefore refundable. */
  liveTicketCount: number
  /** An open request already exists, so a second one is not a new question. */
  hasOpenRequest: boolean
  now: Date
}

export type RefundRefusalReason =
  | 'event_cancelled_always_refundable'   // not a refusal: an override, see below
  | 'free_order'
  | 'order_not_refundable'
  | 'no_live_tickets'
  | 'request_already_open'
  | 'policy_no_refunds'
  | 'window_closed'

export interface RefundEligibility {
  /** May the buyer submit a request at all. */
  canRequest: boolean
  /**
   * Does a submitted request qualify for AUTOMATIC approval under the policy.
   * Funds availability is deliberately NOT decided here: it is a live balance
   * question, not a policy question, and mixing the two would let a policy
   * function claim money exists.
   */
  qualifiesForAuto: boolean
  reason: RefundRefusalReason | 'within_policy'
  /** The sentence shown to the buyer. Always populated, never assembled by callers. */
  message: string
  /** The last moment a request may be submitted, when the policy has a window. */
  deadline: Date | null
}

/** The request window closes this many days before the event starts. */
export function refundDeadline(policy: RefundPolicy, eventStartDate: Date): Date | null {
  if (policy.type !== 'days_before') return null
  const d = new Date(eventStartDate)
  d.setDate(d.getDate() - policy.days)
  return d
}

/**
 * THE CANCELLED-EVENT OVERRIDE, FIRST, BEFORE THE POLICY IS EVEN READ.
 *
 * Both Eventbrite and Ticketmaster override their own policy for a cancelled
 * event, and Eventbrite says so in the same breath as "Don't allow refunds":
 * "if your event is cancelled, you're required to issue refunds". An organiser
 * who sets no_refunds and then cancels has taken money for something that will
 * not happen, and no policy setting makes that keepable. It is checked first so
 * that no later branch can accidentally refuse it.
 */
export function evaluateRefundEligibility(input: RefundEligibilityInput): RefundEligibility {
  const {
    policy, eventStatus, eventStartDate, orderTotalCents,
    orderStatus, liveTicketCount, hasOpenRequest, now,
  } = input

  const deadline = refundDeadline(policy, eventStartDate)

  // Order-level facts come before event-level ones: there is no point telling
  // somebody the window is open for an order that has already been refunded.
  if (!['confirmed', 'partially_refunded'].includes(orderStatus)) {
    return {
      canRequest: false, qualifiesForAuto: false, reason: 'order_not_refundable',
      message: `This order is ${orderStatus.replace(/_/g, ' ')}, so there is nothing left to refund.`,
      deadline,
    }
  }

  if (liveTicketCount <= 0) {
    return {
      canRequest: false, qualifiesForAuto: false, reason: 'no_live_tickets',
      message: 'Every ticket on this order has already been refunded or cancelled.',
      deadline,
    }
  }

  if (orderTotalCents <= 0) {
    return {
      canRequest: false, qualifiesForAuto: false, reason: 'free_order',
      message: 'This was a free ticket, so there is nothing to refund. You can release your spot instead so somebody else can take it.',
      deadline,
    }
  }

  if (eventStatus === 'cancelled') {
    return {
      canRequest: true, qualifiesForAuto: true, reason: 'event_cancelled_always_refundable',
      message: 'This event was cancelled, so your ticket is refundable regardless of the event refund policy.',
      deadline: null,
    }
  }

  if (hasOpenRequest) {
    return {
      canRequest: false, qualifiesForAuto: false, reason: 'request_already_open',
      message: 'You already have a refund request open on this order. The organiser has been notified.',
      deadline,
    }
  }

  if (policy.type === 'no_refunds') {
    return {
      canRequest: false, qualifiesForAuto: false, reason: 'policy_no_refunds',
      message: 'The organiser does not offer refunds for this event. You can still contact them if something has gone wrong.',
      deadline: null,
    }
  }

  if (deadline && now.getTime() > deadline.getTime()) {
    return {
      canRequest: false, qualifiesForAuto: false, reason: 'window_closed',
      message: `Refund requests for this event closed on ${formatDeadline(deadline)}, ${policy.days} day${policy.days === 1 ? '' : 's'} before it starts.`,
      deadline,
    }
  }

  return {
    canRequest: true, qualifiesForAuto: true, reason: 'within_policy',
    message: deadline
      ? `You can request a refund until ${formatDeadline(deadline)}.`
      : 'You can request a refund for this order.',
    deadline,
  }
}

/**
 * The policy as a buyer reads it BEFORE paying, on the event page and in the
 * confirmation email. A policy a buyer cannot read before paying is not a policy.
 */
export function describeRefundPolicy(policy: RefundPolicy, isFree: boolean): string {
  if (isFree) return 'This is a free event, so there is nothing to refund. Release your spot if your plans change.'
  if (policy.type === 'no_refunds') {
    return 'No refunds. If this event is cancelled you will be refunded in full.'
  }
  const window = policy.days === 0
    ? 'right up until the event starts'
    : `up to ${policy.days} day${policy.days === 1 ? '' : 's'} before the event starts`
  const fee = policy.absorbFee
    ? 'The organiser covers the booking fee, so you get the full ticket price back.'
    : 'The booking fee is not returned.'
  const speed = policy.selfService
    ? 'Refunds are automatic, with no waiting on the organiser.'
    : 'The organiser reviews each request.'
  return `Refunds available ${window}. ${fee} ${speed} If this event is cancelled you will be refunded in full.`
}

/** A short label for a card or a badge, where the full sentence will not fit. */
export function refundPolicyBadge(policy: RefundPolicy, isFree: boolean): string {
  if (isFree) return 'Free event'
  if (policy.type === 'no_refunds') return 'No refunds'
  if (policy.days === 0) return 'Refundable until start'
  return `Refundable to ${policy.days} day${policy.days === 1 ? '' : 's'} before`
}

/**
 * THE ONE-WAY RULE, in TypeScript, mirroring
 * public.refund_policy_is_looser_or_equal exactly.
 *
 * Two copies of a rule is normally the defect this codebase spends its time
 * removing, so the reason for the second one is worth stating: the database
 * trigger is the ENFORCEMENT and cannot be bypassed, but it can only refuse with
 * an exception AFTER the organiser has filled in a form. This copy exists so the
 * edit screen can refuse in plain words, before the save, and explain which way
 * the policy is allowed to move. The trigger remains the authority; if these ever
 * disagree, the trigger wins and the disagreement is the bug.
 *
 * tests/unit/refunds/policy-one-way.test.ts drives both over the same table of
 * cases so a change to one that is not made to the other fails.
 */
export function isLooserOrEqual(oldPolicy: RefundPolicy, newPolicy: RefundPolicy): boolean {
  if (oldPolicy.type === 'no_refunds' && newPolicy.type === 'days_before') return true
  if (oldPolicy.type === 'days_before' && newPolicy.type === 'no_refunds') return false
  if (newPolicy.type === 'days_before' && newPolicy.days > oldPolicy.days) return false
  if (oldPolicy.selfService && !newPolicy.selfService) return false
  if (oldPolicy.absorbFee && !newPolicy.absorbFee) return false
  return true
}

/** Why a tightening was refused, in words an organiser can act on. */
export function explainTightening(oldPolicy: RefundPolicy, newPolicy: RefundPolicy): string {
  if (oldPolicy.type === 'days_before' && newPolicy.type === 'no_refunds') {
    return 'You cannot switch a published event to no refunds. People have already bought tickets on the promise that refunds were available. You can shorten the notice period instead, or refund the existing orders and unpublish.'
  }
  if (newPolicy.type === 'days_before' && newPolicy.days > oldPolicy.days) {
    return `You cannot move the cut-off from ${oldPolicy.days} to ${newPolicy.days} days before the event, because that gives buyers LESS time to ask than the policy they bought under. A smaller number is more generous.`
  }
  if (oldPolicy.selfService && !newPolicy.selfService) {
    return 'You cannot turn off instant refunds once an event is published. Buyers bought expecting to be able to refund themselves.'
  }
  if (oldPolicy.absorbFee && !newPolicy.absorbFee) {
    return 'You cannot stop covering the booking fee once an event is published, because buyers would get back less than the terms they bought under.'
  }
  return 'A published refund policy can only be made more generous.'
}

/*
 * THE TIME ZONE IS EXPLICIT, and it has to be.
 *
 * The first version of this called `d.toLocaleDateString('en-AU', ...)` with no
 * `timeZone`, which formats in whatever zone the RUNTIME is in. The server renders
 * in UTC and the browser renders in the reader's own zone, so a deadline a few
 * hours either side of midnight renders as a DIFFERENT DAY on the two, which is
 * both a hydration mismatch and a wrong answer to "when do refunds close".
 * tests/unit/dashboard/no-clock-during-render.test.ts caught it.
 *
 * PLATFORM_TIME_ZONE rather than the event's own zone is deliberate here: this
 * sentence is about a CUT-OFF the platform enforces, not about when the event
 * starts, and the same cut-off must read identically to the buyer, the organiser
 * and the support person looking at it from three different states.
 */
function formatDeadline(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: PLATFORM_TIME_ZONE,
  }).format(d)
}

/** Reads the four columns off an event row into the shape this module uses. */
export function policyFromEvent(row: {
  refund_policy_type?: string | null
  refund_policy_days?: number | null
  refund_policy_absorb_fee?: boolean | null
  refund_policy_self_service?: boolean | null
}): RefundPolicy {
  /*
   * FAIL LOUDLY IN DEVELOPMENT, NEVER QUIETLY REFUSE IN PRODUCTION. A missing
   * column here means the migration has not been applied, and the silent failure
   * mode is the dangerous one: defaulting to no_refunds would refuse every buyer
   * on the platform and look like a policy decision rather than a deployment
   * fault. So development throws, and production takes the DEFAULT the migration
   * declares, which is the permissive one.
   */
  if (row.refund_policy_type == null) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(
        'policyFromEvent: refund_policy_type is absent. Migration 20260820000002 has not been applied to this database.',
      )
    }
  }
  return {
    type: (row.refund_policy_type as RefundPolicyType) ?? 'days_before',
    days: row.refund_policy_days ?? 7,
    absorbFee: row.refund_policy_absorb_fee ?? false,
    selfService: row.refund_policy_self_service ?? false,
  }
}
