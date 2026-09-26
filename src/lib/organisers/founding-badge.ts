import { FOUNDING_BADGE_NAME } from '@/lib/payments/founding-waiver'

/**
 * Is this organisation a Founding Organiser, for the PUBLIC surfaces?
 *
 * Close-out FO1 requires the words "Founding Organiser" on the organiser's own
 * page and on their event pages.
 *
 * EVERY ORGANISER RECEIVES IT (LAW 24 as ruled, 26 September 2026, point 5):
 * "'Founding Organiser' stays as the name and badge, and every organiser
 * receives it." Until that ruling the badge was `organisations.is_founding`,
 * which only a founding invitation conversion ever set, so an organiser who
 * registered without an invitation never received it. That made the badge the
 * one part of the offer that still needed an invitation, and the ruling
 * removes exactly that requirement. `is_founding` stays in the database as the
 * record of who joined through a referral link (the referral months read the
 * referrer from it), and no public surface reads it for the badge any more.
 *
 * So the answer is the organisation itself: an organisation that exists is a
 * Founding Organiser. The function stays async and keeps its shape so the two
 * pages that render the badge did not have to learn a new rule.
 */
export interface FoundingBadge {
  isFounding: boolean
}

/** The badge wording, from the one module that holds the offer. */
export const FOUNDING_BADGE_LABEL = FOUNDING_BADGE_NAME

export async function getFoundingBadge(
  organisationId: string | null | undefined,
): Promise<FoundingBadge> {
  return { isFounding: Boolean(organisationId) }
}
