import { createAdminClient } from '@/lib/supabase/admin'
import {
  FOUNDING_BADGE_NAME,
  getFoundingWaiver,
  type OrganisationReadClient,
} from '@/lib/payments/founding-waiver'

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

/*
 * LAW 24 IS RETIRED (Lawal, 15 November 2026): the badge is no longer offered as a perk. It stays with the
 * organisations that registered before the change, which are exactly those holding a fee-free window: migration
 * 20261115000001 lets no organisation registered after it hold one and moves none later. So the badge is "this
 * organisation holds a window", active or ended. The window is not a public column, so it is read with the service
 * role, as the fee display reads it (src/lib/pricing/event-fee-config.ts); any failure reads as no badge.
 */
export async function getFoundingBadge(
  organisationId: string | null | undefined,
  client?: OrganisationReadClient,
): Promise<FoundingBadge> {
  if (!organisationId) return { isFounding: false }
  try {
    const reader = client ?? (createAdminClient() as unknown as OrganisationReadClient)
    const waiver = await getFoundingWaiver(reader, organisationId)
    return { isFounding: waiver.feeFreeUntil !== null }
  } catch {
    return { isFounding: false }
  }
}
