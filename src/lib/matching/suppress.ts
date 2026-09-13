/**
 * WHO IS TAKEN OUT BEFORE ANYBODY IS SCORED, AND WHY EACH ONE WAS.
 *
 * Suppression is a SEPARATE, EXPLICIT STAGE that runs before scoring, and every
 * removal records its reason. Two things follow from that and both matter.
 *
 * A person who was removed can never appear in a score row, because they were
 * never scored: there is no "filtered later" step to forget. And the admin view
 * can show the funnel from audience size to final list size with a number
 * against each reason, so "why did my event only reach 340 people" is answered
 * with a breakdown rather than an assurance.
 *
 * PURE. The caller gathers the facts (who holds a ticket, who was sent to
 * recently, what the resolver says) and this decides. Nothing here reads a
 * database or a clock it was not handed.
 */

export const SUPPRESSION_REASONS = [
  'consent_not_live',
  'unsubscribed',
  'already_holds_a_ticket',
  'inside_send_cooldown',
  'hard_bounce_or_complaint',
  'below_minimum_score',
] as const

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number]

/** What the admin view prints beside each count. Never a code. */
export const SUPPRESSION_SENTENCES: Record<SuppressionReason, string> = {
  consent_not_live: 'the consent resolver does not currently permit marketing to them',
  unsubscribed: 'they have unsubscribed',
  already_holds_a_ticket: 'they already hold a ticket to this event',
  inside_send_cooldown: 'they were sent something too recently',
  hard_bounce_or_complaint: 'their address hard bounced or they complained',
  below_minimum_score: 'they scored below the floor the owner set',
}

export interface SuppressionFacts {
  /** The consent resolver's answer for this person, on the campaign's channel. */
  consentPermitted: boolean
  /** Whether a withdrawal or a suppression is recorded at all. */
  unsubscribed: boolean
  /** Whether they already hold a ticket to the event being matched. */
  holdsTicket: boolean
  /** When they were last sent a marketing message, or null. */
  lastSentAt: string | null
  /** Whether the address is recorded as a hard bounce or a complaint. */
  bouncedOrComplained: boolean
}

/**
 * The reason this person is out, or null if they stay in. First match wins and
 * the order is deliberate: consent before everything, because it is the only
 * one of these that is a legal answer rather than a commercial one.
 */
export function suppressionReasonFor(
  facts: SuppressionFacts,
  options: { now: Date; cooldownDays: number },
): SuppressionReason | null {
  if (!facts.consentPermitted) return 'consent_not_live'
  if (facts.unsubscribed) return 'unsubscribed'
  if (facts.bouncedOrComplained) return 'hard_bounce_or_complaint'
  if (facts.holdsTicket) return 'already_holds_a_ticket'
  if (facts.lastSentAt) {
    const sentAt = Date.parse(facts.lastSentAt)
    if (!Number.isNaN(sentAt)) {
      const days = (options.now.getTime() - sentAt) / 86_400_000
      if (days < options.cooldownDays) return 'inside_send_cooldown'
    }
  }
  return null
}

/**
 * The floor is applied AFTER scoring, because it is the one suppression that
 * needs a score to decide. It is still recorded in the same funnel, under its
 * own reason, so the count of people who were scored and then dropped is
 * visible rather than folded into "not returned".
 */
export function isBelowFloor(score: number, minimumScoreFloor: number): boolean {
  return score < minimumScoreFloor
}

/** An empty funnel, so every reason appears even at zero rather than missing. */
export function emptyFunnel(): Record<SuppressionReason, number> {
  return SUPPRESSION_REASONS.reduce(
    (acc, reason) => ({ ...acc, [reason]: 0 }),
    {} as Record<SuppressionReason, number>,
  )
}
