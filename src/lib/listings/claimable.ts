/**
 * WHO MAY CLAIM A LISTING, ONE RULE FOR THE CLAIM PAGE AND THE LINK THAT LEADS TO IT (window 6's gap list of 30 October
 * 2026, item 2; blueprint B21, specification s8).
 *
 * The claim page (src/app/events/[slug]/claim/page.tsx) offered a claim for a night EventLinqs listed from public
 * information at a venue on record, and nothing on the public event page linked to it: only the outreach emails carried
 * the link, so an organiser who found their own night had no way in. The page and the link now ask this one function,
 * so the link is shown exactly where the claim page would accept the claim. Both stay behind the listing_claims flag.
 *
 * A leaf, no imports: the event page, the walk-in page and the claim page all read it.
 */
export function listingClaimable(input: { listingSource: string | null | undefined; hasVenue: boolean }): boolean {
  return input.listingSource === 'eventlinqs' && input.hasVenue
}

/** The link's words, from the organiser messages' own claim wording (EVENTLINQS-ORGANISER-MESSAGES-28OCT.md). */
export const CLAIM_LISTING_LINE = 'Is this your event? Claim it free and update it with your own posters and photos.'
