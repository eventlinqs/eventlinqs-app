/**
 * THE WAY IN TO A CLAIM FROM A PUBLIC PAGE (window 6, 30 October 2026; the gap list's item 2: no public page linked to
 * a claim, so once claims are on an organiser who lands on their own listing had no way in; blueprint B21 "a link on the
 * event page for organisers to correct or claim their listing"; spec s8 "secure claim links").
 *
 * The rule is the claim page's own (src/app/venues/[handle]/claim/page.tsx: "claimable = listing_source ===
 * 'eventlinqs' && !claimed_at"): a venue EventLinqs listed and nobody has claimed, and not removed. The link shows only
 * while the listing_claims flag is on, so it appears the moment Lawal turns claims on and never before. Pure.
 */

export type ClaimEntryRow = { listing_source: string | null; claimed_at: string | null; removed_at: string | null }

/** Whether a venue's page offers the claim: claims on, an EventLinqs listing, unclaimed, not removed. */
export function offersVenueClaim(claimsOn: boolean, row: ClaimEntryRow | null): boolean {
  return claimsOn && row !== null && row.listing_source === 'eventlinqs' && !row.claimed_at && !row.removed_at
}

/** The words, one place: the question and the link. */
export const CLAIM_ENTRY_QUESTION = (venueName: string): string => `Run ${venueName}?`
export const CLAIM_ENTRY_LINK = 'Claim this venue to correct its details and add your own photos'
