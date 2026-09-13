/**
 * PACING: WHICH MESSAGE, IF ANY, THIS PERSON SHOULD GET NOW.
 *
 * PURE. No database, no clock, no environment. Everything it needs is handed to
 * it, so the same inputs always produce the same answer and a test can walk
 * every boundary without a fixture.
 *
 * BY DAYS REMAINING TO THE EVENT, NOT BY A CALENDAR. A message about an event
 * eleven days out and a message about an event two days out are different
 * messages. A fixed calendar sends the wrong one to every event that is not on
 * the schedule the calendar was written for, which is most of them.
 *
 * EVERY REFUSAL CARRIES A REASON, and the reasons are stored rather than
 * inferred. "This person was not sent anything" is not an answer; "this person
 * was not sent anything because their consent covers email and the step is an
 * SMS" is, and it is the answer a complaint needs.
 *
 * MORE THAN ONE STEP CAN COVER ONE DAY, deliberately. The seeded sequence has
 * an email step at 2 to 7 days and an SMS step at 1 to 3, so at three days out
 * both are open. Candidates are therefore tried IN STEP ORDER and the first one
 * that survives is queued; the ones that did not survive are returned with the
 * reason each failed, because that list is what an organiser is owed when they
 * ask why somebody heard nothing.
 */

export const SKIP_REASON = {
  EVENT_ALREADY_STARTED: 'the_event_has_already_started',
  NO_STEP_FOR_DAYS_REMAINING: 'no_step_covers_the_days_remaining',
  ALREADY_SENT_THIS_STEP: 'this_recipient_has_already_had_this_step',
  INSIDE_MINIMUM_GAP: 'inside_the_minimum_gap_since_the_previous_send',
  SMS_CONSENT_NOT_GRANTED: 'the_consent_does_not_cover_sms',
} as const

export type SkipReason = (typeof SKIP_REASON)[keyof typeof SKIP_REASON]

export const SKIP_SENTENCE: Record<SkipReason, string> = {
  [SKIP_REASON.EVENT_ALREADY_STARTED]:
    'The event has already started, so nothing is queued for it.',
  [SKIP_REASON.NO_STEP_FOR_DAYS_REMAINING]:
    'No step in the sequence covers how many days are left before this event.',
  [SKIP_REASON.ALREADY_SENT_THIS_STEP]:
    'This person has already had this step of the sequence.',
  [SKIP_REASON.INSIDE_MINIMUM_GAP]:
    'This person heard from this campaign too recently for the next step to open.',
  [SKIP_REASON.SMS_CONSENT_NOT_GRANTED]:
    'This person consented to email and this step is an SMS, so it is not sent.',
}

export interface PacingStep {
  id: string
  stepOrder: number
  channelCode: string
  daysRemainingMin: number
  daysRemainingMax: number
  templateKey: string
  minHoursSincePreviousSend: number
}

export interface PacingRecipient {
  allowlistId: string
  /** Copied onto the allowlist row at admission. */
  consentChannelScope: 'email' | 'sms' | 'both'
  /** When this campaign last reached this person, or null if never. */
  lastSentAt: string | null
  /** Step ids this person has already been sent on this campaign. */
  stepIdsAlreadySent: readonly string[]
}

export interface ConsideredStep {
  stepId: string
  stepOrder: number
  reason: SkipReason
}

export type PacingOutcome =
  | { queued: true; step: PacingStep; considered: ConsideredStep[] }
  | { queued: false; reason: SkipReason; considered: ConsideredStep[] }

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Whole days from `now` to the event, floored.
 *
 * Floored rather than rounded so a step bounded at 2 days opens when there are
 * two full days left, not when there are two and a half. Rounding would let a
 * "two days away" message go out while the subject line says three.
 */
export function daysRemainingToEvent(eventStartsAt: string, now: Date): number {
  const start = Date.parse(eventStartsAt)
  if (!Number.isFinite(start)) return Number.NaN
  return Math.floor((start - now.getTime()) / DAY_MS)
}

function scopeCoversChannel(scope: PacingRecipient['consentChannelScope'], channelCode: string): boolean {
  return scope === 'both' || scope === channelCode
}

export function planNextSend(input: {
  daysRemaining: number
  steps: readonly PacingStep[]
  recipient: PacingRecipient
  now: Date
}): PacingOutcome {
  const considered: ConsideredStep[] = []

  if (!Number.isFinite(input.daysRemaining) || input.daysRemaining < 0) {
    return { queued: false, reason: SKIP_REASON.EVENT_ALREADY_STARTED, considered }
  }

  const covering = [...input.steps]
    .filter(s => input.daysRemaining >= s.daysRemainingMin && input.daysRemaining <= s.daysRemainingMax)
    .sort((a, b) => a.stepOrder - b.stepOrder)

  if (covering.length === 0) {
    return { queued: false, reason: SKIP_REASON.NO_STEP_FOR_DAYS_REMAINING, considered }
  }

  for (const step of covering) {
    if (input.recipient.stepIdsAlreadySent.includes(step.id)) {
      considered.push({ stepId: step.id, stepOrder: step.stepOrder, reason: SKIP_REASON.ALREADY_SENT_THIS_STEP })
      continue
    }
    if (!scopeCoversChannel(input.recipient.consentChannelScope, step.channelCode)) {
      considered.push({ stepId: step.id, stepOrder: step.stepOrder, reason: SKIP_REASON.SMS_CONSENT_NOT_GRANTED })
      continue
    }
    if (input.recipient.lastSentAt !== null && step.minHoursSincePreviousSend > 0) {
      const last = Date.parse(input.recipient.lastSentAt)
      const elapsedHours = Number.isFinite(last) ? (input.now.getTime() - last) / HOUR_MS : Number.POSITIVE_INFINITY
      if (elapsedHours < step.minHoursSincePreviousSend) {
        considered.push({ stepId: step.id, stepOrder: step.stepOrder, reason: SKIP_REASON.INSIDE_MINIMUM_GAP })
        continue
      }
    }
    return { queued: true, step, considered }
  }

  /*
   * Every covering step was refused, and the headline is the first refusal that
   * is a DECISION rather than a normal state.
   *
   * "This person already had this step" is not a problem; it is the sequence
   * working. Reporting it as the headline would bury the one an organiser
   * actually needs to see, which is why this person is not getting the step the
   * ladder moved on to: their consent does not cover it, or they heard from the
   * campaign too recently. The full list always travels alongside, so nothing
   * is hidden either way.
   */
  const decision = considered.find(c => c.reason !== SKIP_REASON.ALREADY_SENT_THIS_STEP)
  return { queued: false, reason: (decision ?? considered[0]).reason, considered }
}
